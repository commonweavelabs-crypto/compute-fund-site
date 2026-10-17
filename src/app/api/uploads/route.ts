import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ALLOWED_IMAGE_TYPES,
  CREATE_SQL,
  EXT_BY_TYPE,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_PROJECT,
  SHOWCASE_BUCKET,
  type ShowcaseImage,
} from "@/lib/showcase";

// Showcase upload route: browser → here (service-role admin client) → storage.
// LAW: the service-role key touches only this server-side route; FormData from
// the SHOWCASE_BUCKET never exposes storage keys to the browser.

export const runtime = "nodejs";

const projectIdSchema = z.string().min(1).max(200);

const BUCKET_PUBLIC = { public: true } as const;

/** Idempotent bucket ensure (get → create; 'already exists' is not an error). */
async function ensureBucket(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>): Promise<void> {
  const { data } = await admin.storage.getBucket(SHOWCASE_BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(SHOWCASE_BUCKET, BUCKET_PUBLIC);
  if (error && !/already exists/i.test(error.message)) {
    throw error;
  }
}

export async function POST(request: NextRequest) {
  // Module-import-time side effects are forbidden (supabase.ts law): every
  // Supabase touch happens inside this handler. CREATE_SQL is documented here
  // for operators — the table/bucket are made idempotent server-side.
  void CREATE_SQL;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase not configured: SUPABASE_SERVICE_ROLE_KEY is not set" },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid multipart body" }, { status: 400 });
  }

  let projectId: string;
  try {
    projectId = projectIdSchema.parse(form.get("projectId"));
  } catch {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const files = form.getAll("images");
  if (files.length === 0) {
    return NextResponse.json({ error: "no images provided" }, { status: 400 });
  }

  for (const entry of files) {
    if (!(entry instanceof File)) {
      return NextResponse.json({ error: "images must be file entries" }, { status: 400 });
    }
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(entry.type)) {
      return NextResponse.json(
        { error: `unsupported type ${entry.type || "unknown"} — jpg, png or webp only` },
        { status: 400 },
      );
    }
    if (entry.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `"${entry.name}" is over the 5 MB limit` },
        { status: 400 },
      );
    }
  }

  // Max 8 images per project: count committed rows (authoritative) not storage listing.
  const { count } = await admin
    .from("project_showcase")
    .select("storage_path", { count: "exact", head: true })
    .eq("project_id", projectId);
  const existing = count ?? 0;
  if (existing + files.length > MAX_IMAGES_PER_PROJECT) {
    return NextResponse.json(
      { error: `max ${MAX_IMAGES_PER_PROJECT} images per project (${existing} already present)` },
      { status: 400 },
    );
  }

  try {
    await ensureBucket(admin);
  } catch (err) {
    const message = err instanceof Error ? err.message : "storage unavailable";
    return NextResponse.json({ error: `storage bucket error: ${message}` }, { status: 503 });
  }

  const uploaded: ShowcaseImage[] = [];
  const usedPositions = new Set<number>();
  try {
    const { data: rows } = await admin
      .from("project_showcase")
      .select("position")
      .eq("project_id", projectId);
    for (const row of (rows as Record<string, unknown>[] | null) ?? []) {
      usedPositions.add(Number(row.position ?? 0));
    }
  } catch {
    // table not migrated yet — CREATE_SQL pending; still allow the upload and
    // record rows later if possible (positions from storage listing below).
  }

  let nextPos = 0;
  const nextPosition = (): number => {
    while (usedPositions.has(nextPos)) nextPos += 1;
    usedPositions.add(nextPos);
    return nextPos;
  };

  for (const file of files as File[]) {
    const pos = nextPosition();
    const path = `${projectId}/${pos}.${EXT_BY_TYPE[file.type] ?? "png"}`;
    const { error } = await admin.storage
      .from(SHOWCASE_BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (error) {
      // Roll back anything we wrote this request so positions stay reusable.
      if (uploaded.length > 0) {
        await admin.storage.from(SHOWCASE_BUCKET).remove(uploaded.map((img) => img.storagePath));
      }
      if (/duplicate/i.test(error.message)) {
        return NextResponse.json({ error: "storage position collision — retry" }, { status: 409 });
      }
      return NextResponse.json({ error: `storage upload failed: ${error.message}` }, { status: 500 });
    }
    const { data } = admin.storage.from(SHOWCASE_BUCKET).getPublicUrl(path);
    uploaded.push({
      id: `${projectId}:${path}`,
      url: data.publicUrl,
      storagePath: path,
      position: pos,
      createdAt: new Date().toISOString(),
    });
  }

  let persisted = true;
  try {
    const { error } = await admin
      .from("project_showcase")
      .insert(
        uploaded.map((img) => ({
          project_id: projectId,
          url: img.url,
          storage_path: img.storagePath,
          position: img.position,
        })),
      );
    if (error) throw error;
  } catch (err) {
    persisted = false;
    console.warn("[uploads] project_showcase insert failed (CREATE_SQL applied?):", err);
  }

  return NextResponse.json({ images: uploaded, persisted });
}
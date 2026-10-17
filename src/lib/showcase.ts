// Showcase data layer (spec: accounts-roles-profiles.md § "Project page = the showcase").
// Hero gallery + story, owner/manager-edited. Supabase when configured, in-memory
// mock otherwise — same null-safe laziness law as src/lib/supabase.ts.
//
// LAW: the app never executes raw SQL. The DDL below is shipped as CREATE_SQL
// for the parent to apply server-side ONCE (idempotent). Storage writes go
// exclusively through /api/uploads (service-role admin client, keys never
// reach the browser).

import { getSupabase, getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const SHOWCASE_BUCKET = "showcase";
export const MAX_IMAGES_PER_PROJECT = 8;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Idempotent DDL applied server-side (parent's job — never run from the app). */
export const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS project_showcase (
  project_id text NOT NULL,
  url text NOT NULL,
  storage_path text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, storage_path)
);
CREATE INDEX IF NOT EXISTS project_showcase_project_idx
  ON project_showcase (project_id, position);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS story text;
`;

export type ShowcaseImage = {
  id: string;
  /** served public URL of the image */
  url: string;
  /** storage path inside the showcase bucket ('<projectId>/<n>.<ext>') */
  storagePath: string;
  position: number;
  createdAt: string;
};

export type ShowcaseState = {
  projectId: string;
  images: ShowcaseImage[];
  story: string | null;
};

export type UploadResult = {
  ok: boolean;
  /** false = mock mode kept the images in-memory only */
  persistedSupabase: boolean;
  images: ShowcaseImage[];
  error?: string;
};

// ── mock-mode store (module state; survives client-side navigations) ──────────
const mockImages = new Map<string, ShowcaseImage[]>();
const mockStory = new Map<string, string>();

function nextMockPosition(projectId: string): number {
  const list = mockImages.get(projectId) ?? [];
  return list.length;
}

// ── validation helpers (shared by the editor UI and re-checked server-side) ──
export function validateImageFile(file: File): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `unsupported type ${file.type || "unknown"} — jpg, png or webp only`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `"${file.name}" is over the 5 MB limit`;
  }
  return null;
}

export const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// ── uploads (browser → /api/uploads → service-role storage write) ────────────
export async function uploadImages(projectId: string, files: File[] | FileList): Promise<UploadResult> {
  const list = Array.from(files);
  const existing = mockImages.get(projectId)?.length ?? 0;
  if (list.length === 0) {
    return { ok: false, persistedSupabase: false, images: [], error: "no images selected" };
  }
  if (existing + list.length > MAX_IMAGES_PER_PROJECT) {
    return {
      ok: false,
      persistedSupabase: false,
      images: [],
      error: `max ${MAX_IMAGES_PER_PROJECT} images per project (${existing} already present)`,
    };
  }
  for (const file of list) {
    const invalid = validateImageFile(file);
    if (invalid) {
      return { ok: false, persistedSupabase: false, images: [], error: invalid };
    }
  }

  // Unconfigured (no anon keys) → straight to mock, no network attempt.
  if (!isSupabaseConfigured()) {
    return { ok: true, persistedSupabase: false, images: mockAppend(projectId, list) };
  }

  const body = new FormData();
  body.set("projectId", projectId);
  for (const file of list) body.append("images", file);

  try {
    const res = await fetch("/api/uploads", { method: "POST", body });
    const json = (await res.json().catch(() => null)) as
      | { error?: string; images?: ShowcaseImage[] }
      | null;
    if (!res.ok) {
      // Service role missing (503) or validation/config failure → local mock
      // keeps the editor usable in dev; the message explains why (law: surface it).
      return {
        ok: false,
        persistedSupabase: false,
        images: [],
        error: json?.error ?? `upload failed (${res.status})`,
      };
    }
    const images = (json?.images ?? []).map((img) => ({ ...img }));
    mockImages.set(projectId, [...(mockImages.get(projectId) ?? []), ...images]);
    return { ok: true, persistedSupabase: true, images };
  } catch (err) {
    return {
      ok: false,
      persistedSupabase: false,
      images: [],
      error: err instanceof Error ? err.message : "upload request failed",
    };
  }
}

function mockAppend(projectId: string, files: File[]): ShowcaseImage[] {
  const list = mockImages.get(projectId) ?? [];
  const added = files.map((file, i) => {
    const n = nextMockPosition(projectId) + i;
    return {
      id: `mock-${projectId}-${n}-${file.name}`,
      url: URL.createObjectURL(file),
      storagePath: `${projectId}/${n}.${EXT_BY_TYPE[file.type] ?? "png"}`,
      position: n,
      createdAt: new Date().toISOString(),
    } satisfies ShowcaseImage;
  });
  mockImages.set(projectId, [...list, ...added]);
  return added;
}

// ── reads ────────────────────────────────────────────────────────────────────
export async function listShowcase(projectId: string): Promise<ShowcaseState> {
  const db = getSupabase();
  if (db) {
    const [imagesRes, projectRes] = await Promise.all([
      db
        .from("project_showcase")
        .select("project_id, url, storage_path, position, created_at")
        .eq("project_id", projectId)
        .order("position", { ascending: true }),
      db.from("projects").select("id, story").eq("id", projectId).maybeSingle(),
    ]);
    if (!imagesRes.error && imagesRes.data) {
      const images = (imagesRes.data as Record<string, unknown>[]).map((row) => ({
        id: `${row.project_id}:${row.storage_path}`,
        url: String(row.url),
        storagePath: String(row.storage_path),
        position: Number(row.position ?? 0),
        createdAt: String(row.created_at ?? ""),
      }));
      const story = projectRes.error
        ? null
        : ((projectRes.data as Record<string, unknown> | null)?.story as string | null) ?? null;
      return { projectId, images, story };
    }
    // table not migrated yet → fall through to mock store
  }
  return {
    projectId,
    images: mockImages.get(projectId) ?? [],
    story: mockStory.get(projectId) ?? null,
  };
}

// ── story (owner/manager) ─────────────────────────────────────────────────────
/** Writes projects.story via the service-role admin client (server context);
 *  falls back to the anon client; falls back to mock when unconfigured. */
export async function setStory(projectId: string, story: string): Promise<boolean> {
  const db = getSupabaseAdmin() ?? getSupabase();
  if (db) {
    const { error } = await db.from("projects").update({ story }).eq("id", projectId);
    if (!error) return true;
    console.warn("[showcase] setStory failed:", error.message);
    return false;
  }
  mockStory.set(projectId, story);
  return true;
}

// ── gallery order ─────────────────────────────────────────────────────────────
/** Re-positions the gallery rows to match `orderedPaths` (storage_path order). */
export async function setGalleryOrder(projectId: string, orderedPaths: string[]): Promise<boolean> {
  const db = getSupabaseAdmin() ?? getSupabase();
  const rows = orderedPaths.map((storagePath, i) => ({ project_id: projectId, storage_path: storagePath, position: i }));
  if (db && isSupabaseConfigured()) {
    const { error } = await db
      .from("project_showcase")
      .upsert(rows, { onConflict: "project_id,storage_path" });
    if (!error) return true;
    console.warn("[showcase] setGalleryOrder failed:", error.message);
    return false;
  }
  const list = mockImages.get(projectId);
  if (list) {
    list.sort((a, b) => {
      const ia = orderedPaths.indexOf(a.storagePath);
      const ib = orderedPaths.indexOf(b.storagePath);
      return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    });
    list.forEach((img, i) => (img.position = i));
  }
  return true;
}
// Fork API — POST create a fork, PATCH update one-hop rent.
// 503 when Supabase is not configured: forks are ownership records that must
// survive restarts, so the API requires the real store (the in-memory fork
// fallback in src/lib/forks.ts serves direct lib callers / tests only).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  createFork,
  updateForkRent,
  FORK_RENT_MIN,
  FORK_RENT_MAX,
  type UpdateRentResult,
} from "@/lib/forks";

const createForkSchema = z.object({
  parentProjectId: z.string().min(1),
  newTitle: z.string().min(1).max(200),
  forkerProfileId: z.string().min(1),
  forkRentPct: z.number().int().min(FORK_RENT_MIN).max(FORK_RENT_MAX).optional(),
});

const updateRentSchema = z.object({
  projectId: z.string().min(1),
  pct: z.number().int().min(FORK_RENT_MIN).max(FORK_RENT_MAX),
  ownerId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY are not set" },
      { status: 503 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = createForkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }
  const { parentProjectId, newTitle, forkerProfileId, forkRentPct } = parsed.data;
  const result = await createFork({ parentProjectId, newTitle, forkerProfileId, forkRentPct });
  if (!result.ok) {
    const status = result.reason === "parent-not-found" ? 404 : 400;
    return NextResponse.json({ error: result.detail ?? result.reason }, { status });
  }
  return NextResponse.json(
    {
      fork: result.result.fork,
      parentId: result.result.parentId,
      parentTitle: result.result.parentTitle,
      rentPct: result.result.rentPct,
      rentSplitId: result.result.rentSplitId,
    },
    { status: 201 },
  );
}

export async function PATCH(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY are not set" },
      { status: 503 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = updateRentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }
  const { projectId, pct, ownerId } = parsed.data;
  const result: UpdateRentResult = await updateForkRent(projectId, pct, ownerId);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 403 });
  }
  return NextResponse.json({ ok: true, projectId, forkRentPct: result.forkRentPct });
}
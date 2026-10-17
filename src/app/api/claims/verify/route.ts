// POST /api/claims/verify — run the verification ladder for one project.
// Supabase unconfigured → 503 (caller keeps the local/mock claim flow).
// Provider tokens pass through in the request body only; they are forwarded to
// api.github.com and never logged, persisted, or echoed in the response.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase";
import { verifyClaim } from "@/lib/claims";

const bodySchema = z.object({
  projectId: z.string().min(1),
  providerToken: z.string().optional().default(""),
  githubLogin: z.string().optional().default(""),
});

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured: claim verification requires live data" },
      { status: 503 },
    );
  }
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body: projectId (string) required; providerToken, githubLogin optional" },
        { status: 400 },
      );
    }
    const result = await verifyClaim({
      projectId: parsed.data.projectId,
      providerToken: parsed.data.providerToken || undefined,
      githubLogin: parsed.data.githubLogin || undefined,
    });
    if (result.error) {
      return NextResponse.json(result, { status: 404 });
    }
    // Response carries evidence + claim code only — never the provider token.
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Claim verification error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Claim verification failed" }, { status: 500 });
  }
}
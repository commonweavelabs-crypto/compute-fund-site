// /api/sweeps — stewardship sweep + public stewardship pulse.
//   POST { projectId }            → sweepTokens: mark pending ledger tokens swept, { sweptCount }
//   GET  ?projectId=...           → stewardshipPulse: public last-sweep receipt
// Unconfigured Supabase falls back to mock mode (in-memory receipts), matching lib law;
// a live sweep needs the service-role client — missing key returns 503 for POST.

import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { sweepTokens, stewardshipPulse } from "@/lib/sweeps";

async function projectIdFromRequest(request: NextRequest): Promise<string | null> {
  if (request.method === "POST") {
    try {
      const body = (await request.json()) as { projectId?: string };
      return body.projectId ?? null;
    } catch {
      return null;
    }
  }
  return request.nextUrl.searchParams.get("projectId");
}

export async function POST(request: NextRequest) {
  try {
    const projectId = await projectIdFromRequest(request);
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    if (isSupabaseConfigured() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Sweep requires the service-role key (SUPABASE_SERVICE_ROLE_KEY)" },
        { status: 503 },
      );
    }
    const result = await sweepTokens(projectId);
    if (result.error) {
      return NextResponse.json({ error: result.error, sweptCount: result.sweptCount }, { status: 500 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Token sweep error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Token sweep failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    const pulse = await stewardshipPulse(projectId);
    return NextResponse.json(pulse, { status: 200 });
  } catch (error) {
    console.error("Stewardship pulse error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Stewardship pulse failed" }, { status: 500 });
  }
}
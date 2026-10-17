// Supabase clients — lazy + null-safe.
// LAW: no module may open a network connection or the SQL store at import time
// (build-time page-data collection imports route modules in a different cwd).
// Every call site checks for null and falls back to mock-db so local dev
// works with zero credentials (plan Task 15 Step 3).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

let browserClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(URL && ANON);
}

/** Anon-key client for reads + auth. Null when Supabase is not configured. */
export function getSupabase(): SupabaseClient | null {
  if (!URL || !ANON) return null;
  if (!browserClient) {
    browserClient = createClient(URL, ANON, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return browserClient;
}

/** Service-role client for webhook/compute-runner writes (bypasses RLS). Server-only. */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!URL || !SERVICE) return null;
  if (!adminClient) {
    adminClient = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
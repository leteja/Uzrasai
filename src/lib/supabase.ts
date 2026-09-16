import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;

  client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function supabaseKeyRole(): "service_role" | "anon" | "missing" | "unknown" {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return "missing";
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")) as {
      role?: string;
    };
    if (payload.role === "service_role") return "service_role";
    if (payload.role === "anon") return "anon";
    return "unknown";
  } catch {
    return "unknown";
  }
}

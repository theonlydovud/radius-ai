/**
 * Admin client with the service role key. Bypasses Row Level Security.
 * Only ever import this from server-side code (Route Handlers), never
 * from client components.
 */
let adminClient: any = null;

export function createAdminClient() {
  // Один клиент на процесс: createClient() на каждый вызов (а их десятки на
  // сообщение) — лишние аллокации и новые HTTP-агенты.
  if (!adminClient) {
    const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
    adminClient = createSupabaseClient(
      (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return adminClient;
}

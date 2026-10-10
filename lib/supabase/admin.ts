import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Server only. Bypasses RLS: use solely for audit_events, identities and verified evidence,
// and only after confirming the caller's session.
export function createAdminClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

import "server-only";
import { createClient } from "@supabase/supabase-js";

/** True when the server can create logins (SUPABASE_SECRET_KEY is set in the environment). */
export const canManageLogins = () => Boolean(process.env.SUPABASE_SECRET_KEY);

/**
 * Auth admin client for creating logins and setting passwords. Server-only: the secret key never
 * reaches the browser. Callers must check the signed-in user's permission first (via an RPC that
 * runs as that user) because this client bypasses row-level security.
 */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const MIN_PASSWORD = 8;

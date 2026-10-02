import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { browserAuthCookieOptions } from "./auth-cookie-options";

let browserClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Variáveis públicas do Supabase não configuradas.");
  }

  if (!browserClient) {
    browserClient = createBrowserClient(url, key, {
      cookieOptions: browserAuthCookieOptions(),
      auth: { experimental: { passkey: true } },
    });
  }

  return browserClient;
}

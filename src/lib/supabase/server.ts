import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverAuthCookieOptions } from "./auth-cookie-options";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Variáveis públicas do Supabase não configuradas.");
  }

  const cookieStore = await cookies();
  const shared = serverAuthCookieOptions();

  return createServerClient(url, key, {
    cookieOptions: shared,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, _responseHeaders) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, { ...options, ...shared });
          });
        } catch {
          // Server Components não podem escrever cookies. O proxy renova a sessão.
        }
      },
    },
  });
}

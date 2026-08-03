import { createBrowserClient } from "@supabase/ssr";

let browserClient:
  | ReturnType<typeof createBrowserClient>
  | null = null;

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Variáveis públicas do Supabase não configuradas.",
    );
  }

  if (!browserClient) {
    browserClient = createBrowserClient(url, key, {
      auth: {
        experimental: {
          passkey: true,
        },
      },
    });
  }

  return browserClient;
}

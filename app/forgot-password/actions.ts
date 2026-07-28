"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";

async function appOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/forgot-password?error=Informe%20seu%20e-mail.");

  const origin = await appOrigin();
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  redirect("/forgot-password?message=Confira%20seu%20e-mail%20para%20redefinir%20a%20senha.");
}

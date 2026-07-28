"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { normalizeNextPath } from "@/src/lib/auth";

async function appOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    next: normalizeNextPath(formData.get("next")),
  };
}

function authError(message: string, next: string) {
  redirect(`/login?error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`);
}

export async function loginWithPassword(formData: FormData) {
  const { email, password, next } = readCredentials(formData);
  if (!email || password.length < 8) {
    authError("Informe um e-mail válido e uma senha com pelo menos 8 caracteres.", next);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    authError("E-mail ou senha incorretos.", next);
  }

  redirect(next);
}

export async function createAccount(formData: FormData) {
  const { email, password, next } = readCredentials(formData);
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!email || password.length < 8 || fullName.length < 2) {
    authError("Preencha nome, e-mail e uma senha com pelo menos 8 caracteres.", next);
  }

  const origin = await appOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    authError(error.message.includes("registered") ? "Este e-mail já está cadastrado." : "Não foi possível criar a conta.", next);
  }

  if (data.session) {
    redirect("/onboarding");
  }

  redirect(`/login?message=${encodeURIComponent("Conta criada. Confirme o e-mail para continuar.")}`);
}

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = normalizeNextPath(formData.get("next"));

  if (!email) authError("Informe seu e-mail.", next);

  const origin = await appOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });

  if (error) authError("Não foi possível enviar o link de acesso.", next);

  redirect(`/login?message=${encodeURIComponent("Enviamos um link de acesso para o seu e-mail.")}`);
}

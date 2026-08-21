"use server";

import { redirect } from "next/navigation";
import { authCallbackUrl } from "@/src/lib/auth-origin";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

export async function sendCommercialMagicLinkAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    redirect(
      `/comercial?error=${encodeURIComponent("Informe um e-mail válido.")}`,
    );
  }

  const admin = createAdminClient();
  const { data: operator, error: operatorError } = await admin
    .from("sales_operators")
    .select("id,name,email,active")
    .eq("email", email)
    .eq("active", true)
    .maybeSingle();

  if (operatorError) {
    console.error("Falha ao validar acesso comercial:", operatorError.message);
    redirect(
      `/comercial?error=${encodeURIComponent(
        "Não foi possível validar seu acesso agora.",
      )}`,
    );
  }

  if (!operator) {
    redirect(
      `/comercial?error=${encodeURIComponent(
        "Este e-mail ainda não foi liberado para a área comercial.",
      )}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: {
        full_name: String(operator.name),
        monitoria_commercial_operator: true,
      },
      emailRedirectTo: authCallbackUrl("/comercial"),
    },
  });

  if (error) {
    console.error("Falha ao enviar acesso comercial:", error.message);
    redirect(
      `/comercial?error=${encodeURIComponent(
        "Não foi possível enviar o link de acesso agora.",
      )}`,
    );
  }

  redirect(
    `/comercial?message=${encodeURIComponent(
      "Enviamos um link de acesso para o seu e-mail.",
    )}`,
  );
}

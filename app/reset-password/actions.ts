"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";

function resetError(message: string): never {
  redirect(
    `/reset-password?error=${encodeURIComponent(message)}`,
  );
}

function passwordErrorMessage(error: {
  message: string;
  code?: string;
}) {
  const value =
    `${error.code ?? ""} ${error.message}`.toLowerCase();

  if (
    /weak_password|weak|easy to guess|pwned|compromised|leaked/.test(
      value,
    )
  ) {
    return "A senha escolhida é muito comum ou já apareceu em vazamentos. Use uma combinação mais forte e exclusiva.";
  }

  return "Não foi possível atualizar a senha.";
}

export async function updatePassword(
  formData: FormData,
) {
  const password = String(
    formData.get("password") ?? "",
  );
  const confirmation = String(
    formData.get("confirmation") ?? "",
  );

  if (
    password.length < 8 ||
    password !== confirmation
  ) {
    resetError(
      "As senhas devem ser iguais e ter pelo menos 8 caracteres.",
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    console.error(
      "Falha ao redefinir senha:",
      error.message,
    );
    resetError(passwordErrorMessage(error));
  }

  const { error: statusError } = await supabase.rpc(
    "mark_current_user_password_enabled",
  );

  if (statusError) {
    console.error(
      "Senha redefinida, mas status não marcado:",
      statusError.message,
    );
  }

  redirect(
    "/dashboard?message=Senha%20atualizada%20com%20sucesso.",
  );
}

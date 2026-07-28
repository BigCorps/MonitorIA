"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password.length < 8 || password !== confirmation) {
    redirect("/reset-password?error=As%20senhas%20devem%20ser%20iguais%20e%20ter%20ao%20menos%208%20caracteres.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/reset-password?error=N%C3%A3o%20foi%20poss%C3%ADvel%20atualizar%20a%20senha.");

  redirect("/dashboard?message=Senha%20atualizada.");
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { createClient } from "@/src/lib/supabase/server";

export async function revokeMcpConnection(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const clientId = String(formData.get("client_id") ?? "");

  if (!clientId) return;

  const supabase = await createClient();
  await supabase
    .from("mcp_oauth_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("client_id", clientId)
    .is("revoked_at", null);

  revalidatePath("/dashboard/profile/mcp-connections");
}

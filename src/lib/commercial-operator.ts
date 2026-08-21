import { redirect } from "next/navigation";
import {
  requireAuthenticatedUser,
  type AuthenticatedUser,
} from "@/src/lib/auth";
import { isInternalOperatorEmail } from "@/src/lib/internal-operator";
import { createAdminClient } from "@/src/lib/supabase/admin";

export type CommercialOperator = {
  id: string;
  name: string;
  email: string;
  userId: string | null;
};

export type CommercialAccess = {
  user: AuthenticatedUser;
  isManager: boolean;
  operator: CommercialOperator | null;
};

function normalizedEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export async function getCommercialAccessForUser(
  user: AuthenticatedUser,
): Promise<CommercialAccess | null> {
  if (isInternalOperatorEmail(user.email)) {
    return {
      user,
      isManager: true,
      operator: null,
    };
  }

  const email = normalizedEmail(user.email);
  if (!email) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sales_operators")
    .select("id,name,email,user_id,active")
    .eq("email", email)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    console.error("Falha ao verificar operador comercial:", error.message);
    throw new Error("commercial_operator_unavailable");
  }

  if (!data) return null;

  const row = data as {
    id: string;
    name: string;
    email: string;
    user_id: string | null;
    active: boolean;
  };

  if (row.user_id !== user.id) {
    const { error: syncError } = await admin
      .from("sales_operators")
      .update({
        user_id: user.id,
        last_access_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("active", true);

    if (syncError) {
      console.error(
        "Falha ao vincular login do operador comercial:",
        syncError.message,
      );
    }
  } else {
    const { error: accessError } = await admin
      .from("sales_operators")
      .update({ last_access_at: new Date().toISOString() })
      .eq("id", row.id);

    if (accessError) {
      console.error(
        "Falha ao registrar acesso do operador comercial:",
        accessError.message,
      );
    }
  }

  return {
    user,
    isManager: false,
    operator: {
      id: String(row.id),
      name: String(row.name),
      email: String(row.email),
      userId: user.id,
    },
  };
}

export async function requireCommercialAccess(): Promise<CommercialAccess> {
  const user = await requireAuthenticatedUser();
  const access = await getCommercialAccessForUser(user);

  if (!access) {
    redirect("/dashboard");
  }

  return access;
}

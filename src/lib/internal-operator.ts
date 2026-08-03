import { redirect } from "next/navigation";
import {
  requireAuthenticatedUser,
  type AuthenticatedUser,
} from "@/src/lib/auth";

function configuredEmails() {
  return new Set(
    (process.env.MONITORIA_INTERNAL_OPERATOR_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isInternalOperatorEmail(email: string | null | undefined) {
  if (!email) return false;
  return configuredEmails().has(email.trim().toLowerCase());
}

export async function requireInternalOperator(): Promise<AuthenticatedUser> {
  const user = await requireAuthenticatedUser();

  if (!isInternalOperatorEmail(user.email)) {
    redirect("/dashboard");
  }

  return user;
}

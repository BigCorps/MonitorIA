import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
};

function readUserMetadata(value: unknown): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    return null;
  }

  return {
    id: String(claims.sub),
    email: typeof claims.email === "string" ? claims.email : null,
    user_metadata: readUserMetadata(claims.user_metadata),
  };
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  return user;
}

export function normalizeNextPath(
  value: FormDataEntryValue | string | null | undefined,
) {
  const candidate = typeof value === "string" ? value : "/dashboard";
  return candidate.startsWith("/") &&
    !candidate.startsWith("//") &&
    !candidate.includes("\\") &&
    !candidate.includes("\0")
    ? candidate
    : "/dashboard";
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

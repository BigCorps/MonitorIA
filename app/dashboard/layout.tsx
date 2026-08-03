import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

function objectValue(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default async function PrivateAreaLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();

  const [
    { data: claimsData },
    { data: settingsData, error: settingsError },
  ] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.rpc("get_current_user_auth_settings"),
  ]);

  if (!settingsError) {
    const claims = objectValue(claimsData?.claims);
    const settings = objectValue(settingsData);
    const mfaRequired =
      settings.effective_mfa_required === true;
    const aal =
      typeof claims.aal === "string"
        ? claims.aal
        : "aal1";

    if (mfaRequired && aal !== "aal2") {
      redirect(
        `/auth/mfa?next=${encodeURIComponent(
          "/dashboard",
        )}`,
      );
    }
  }

  return children;
}

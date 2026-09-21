import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getOrganizationSourceContext } from "@/src/lib/source-context";
import { EMPTY_SOURCE_CONTEXT } from "@/src/lib/source-mode";
import { DashboardSourceProvider } from "./dashboard-source-context";
import {
  passkeyLoginReady,
} from "@/src/lib/passkey-login-hint";
import { PasskeyLoginHint } from "./passkey-login-hint";

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

  const settings = objectValue(settingsData);
  const passkeyReady = settingsError
    ? null
    : passkeyLoginReady(settings);
  const claims = objectValue(claimsData?.claims);

  let sourceContext = EMPTY_SOURCE_CONTEXT;
  const userId =
    typeof claims.sub === "string" ? claims.sub : null;

  if (userId) {
    try {
      const organization =
        await getCurrentOrganization(userId);

      if (organization) {
        sourceContext =
          await getOrganizationSourceContext(
            organization.id,
          );
      }
    } catch (error) {
      console.error(
        "Falha ao carregar contexto das fontes:",
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }

  if (!settingsError) {
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

  return (
    <DashboardSourceProvider value={sourceContext}>
      <PasskeyLoginHint enabled={passkeyReady} />
      {children}
    </DashboardSourceProvider>
  );
}

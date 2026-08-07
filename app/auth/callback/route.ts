import {
  NextResponse,
  type NextRequest,
} from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { normalizeNextPath } from "@/src/lib/auth";
import { AUTH_CANONICAL_ORIGIN } from "@/src/lib/auth-origin";

/**
 * Destino final do callback.
 *
 * Em produção NÃO derivamos a origem de `x-forwarded-host`. Esse header vem
 * do proxy e pode trazer www, um alias *.vercel.app ou o domínio antigo —
 * jogando o usuário para fora da origem em que a sessão foi criada. É por
 * isso que o Google autenticava e devolvia para a landing.
 *
 * Fora de produção, mantemos o comportamento anterior para não quebrar
 * localhost nem os previews.
 *
 * `path` é sempre um caminho relativo já sanitizado por normalizeNextPath,
 * então `new URL(path, origin)` não abre brecha para open redirect.
 */
function appDestination(
  request: NextRequest,
  path: string,
) {
  if (process.env.VERCEL_ENV === "production") {
    return new URL(path, AUTH_CANONICAL_ORIGIN).toString();
  }

  const forwardedHost =
    request.headers.get("x-forwarded-host");
  const forwardedProto =
    request.headers.get("x-forwarded-proto") ??
    "https";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}${path}`;
  }

  return `${new URL(request.url).origin}${path}`;
}

function loginError(
  request: NextRequest,
  message: string,
) {
  return NextResponse.redirect(
    appDestination(
      request,
      `/login?error=${encodeURIComponent(message)}`,
    ),
  );
}

function objectValue(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const providerError =
    searchParams.get("error_description") ??
    searchParams.get("error");
  const code = searchParams.get("code");
  const next = normalizeNextPath(
    searchParams.get("next"),
  );

  if (providerError) {
    console.error(
      "[MonitorIA Auth] OAuth/callback:",
      providerError,
    );

    return loginError(
      request,
      "A autenticação foi cancelada ou não pôde ser concluída.",
    );
  }

  if (!code) {
    return loginError(
      request,
      "O link de autenticação é inválido ou expirou.",
    );
  }

  const supabase = await createClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error(
      "[MonitorIA Auth] exchangeCodeForSession:",
      exchangeError.message,
    );

    const normalized =
      exchangeError.message.toLowerCase();

    return loginError(
      request,
      normalized.includes("auth_method_disabled")
        ? "Esta forma de entrar não está liberada para a sua conta. Tente outra opção da lista."
        : "Não foi possível concluir o acesso. Tente novamente.",
    );
  }

  const [
    { data: claimsData },
    { data: settingsData },
  ] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.rpc("get_current_user_auth_settings"),
  ]);

  const claims = objectValue(claimsData?.claims);
  const settings = objectValue(settingsData);
  const aal =
    typeof claims.aal === "string"
      ? claims.aal
      : "aal1";
  const mfaRequired =
    settings.effective_mfa_required === true ||
    claims.mfa_required === true ||
    claims.mfa_required === "true";

  if (
    mfaRequired &&
    aal !== "aal2" &&
    !next.startsWith("/auth/mfa")
  ) {
    const mfaPath =
      `/auth/mfa?next=${encodeURIComponent(next)}`;

    return NextResponse.redirect(
      appDestination(request, mfaPath),
    );
  }

  return NextResponse.redirect(
    appDestination(request, next),
  );
}

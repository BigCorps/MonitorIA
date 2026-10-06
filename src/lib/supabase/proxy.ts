import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { serverAuthCookieOptions } from "./auth-cookie-options";

const protectedPrefixes = [
  "/dashboard",
  "/vip/access",
  "/vip/onboarding",
  "/vip/closing",
  "/vip/dashboard",
  "/onboarding",
  "/reset-password",
  "/auth/mfa",
];

const publicAuthPrefixes = ["/login", "/forgot-password"];

function booleanClaim(value: unknown) {
  return value === true || value === "true";
}

function invalidRefreshToken(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";

  return (
    code === "refresh_token_not_found" ||
    /invalid refresh token|refresh token not found/i.test(message)
  );
}

function authCookieNames(request: NextRequest) {
  return Array.from(
    new Set(
      request.cookies
        .getAll()
        .map((cookie) => cookie.name)
        .filter((name) => /^sb-[A-Za-z0-9._-]+$/.test(name)),
    ),
  );
}

function expireCookieHeader(name: string, domain?: string) {
  return [
    `${name}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "SameSite=Lax",
    "Secure",
    domain ? `Domain=${domain}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function clearLegacyHostOnlyAuthCookies(
  response: NextResponse,
  request: NextRequest,
) {
  for (const name of authCookieNames(request)) {
    response.headers.append("Set-Cookie", expireCookieHeader(name));
  }
  return response;
}

function clearInvalidAuthCookies(
  response: NextResponse,
  request: NextRequest,
) {
  for (const name of authCookieNames(request)) {
    response.headers.append("Set-Cookie", expireCookieHeader(name));
    response.headers.append(
      "Set-Cookie",
      expireCookieHeader(name, ".monitoria.cam"),
    );
  }
  return response;
}

function isVipCustomerPath(pathname: string) {
  return (
    pathname.startsWith("/vip/access") ||
    pathname.startsWith("/vip/onboarding") ||
    pathname.startsWith("/vip/closing") ||
    pathname.startsWith("/vip/dashboard")
  );
}

function vipRedirectWithSharedSession(
  request: NextRequest,
  pathname?: string,
) {
  const destination = request.nextUrl.clone();
  if (pathname) destination.pathname = pathname;
  destination.protocol = "https:";
  destination.hostname = "vip.monitoria.cam";
  destination.port = "";

  const redirectResponse = NextResponse.redirect(destination, 308);
  const shared = serverAuthCookieOptions();

  // Migra sessões host-only já existentes sem exigir logout/login.
  for (const cookie of request.cookies.getAll()) {
    if (!cookie.name.startsWith("sb-")) continue;
    redirectResponse.cookies.set(cookie.name, cookie.value, shared);
  }

  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const shared = serverAuthCookieOptions();
  const supabase = createServerClient(url, key, {
    cookieOptions: shared,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, responseHeaders) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, {
            ...options,
            ...shared,
          });
        });

        if (responseHeaders) {
          Object.entries(responseHeaders).forEach(([name, value]) => {
            response.headers.set(name, value);
          });
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const claims =
    data?.claims && typeof data.claims === "object"
      ? (data.claims as Record<string, unknown>)
      : null;

  const signedIn = !error && Boolean(claims?.sub);
  const pathname = request.nextUrl.pathname;
  const currentPath = pathname + request.nextUrl.search;
  const isProtected = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );
  const isPublicAuth = publicAuthPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (invalidRefreshToken(error)) {
    if (
      pathname.startsWith("/auth/confirm") ||
      pathname.startsWith("/auth/callback")
    ) {
      return clearLegacyHostOnlyAuthCookies(
        NextResponse.next({ request }),
        request,
      );
    }

    if (isProtected) {
      const loginUrl = request.nextUrl.clone();

      if (request.nextUrl.hostname.toLowerCase() === "vip.monitoria.cam") {
        loginUrl.protocol = "https:";
        loginUrl.hostname = "monitoria.cam";
        loginUrl.port = "";
      }

      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("next", currentPath);

      return clearInvalidAuthCookies(
        NextResponse.redirect(loginUrl),
        request,
      );
    }

    return clearInvalidAuthCookies(
      NextResponse.next({ request }),
      request,
    );
  }
  const mfaRequired = booleanClaim(claims?.mfa_required);
  const aal = typeof claims?.aal === "string" ? claims.aal : "aal1";

  if (
    signedIn &&
    process.env.VERCEL_ENV === "production" &&
    request.nextUrl.hostname.toLowerCase() === "monitoria.cam" &&
    isVipCustomerPath(pathname)
  ) {
    return vipRedirectWithSharedSession(request);
  }

  if (isProtected && !signedIn) {
    const loginUrl = request.nextUrl.clone();

    if (request.nextUrl.hostname.toLowerCase() === "vip.monitoria.cam") {
      loginUrl.protocol = "https:";
      loginUrl.hostname = "monitoria.cam";
      loginUrl.port = "";
    }

    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", currentPath);
    return NextResponse.redirect(loginUrl);
  }

  if (
    signedIn &&
    mfaRequired &&
    aal !== "aal2" &&
    !pathname.startsWith("/auth/mfa")
  ) {
    const mfaUrl = request.nextUrl.clone();

    if (request.nextUrl.hostname.toLowerCase() === "vip.monitoria.cam") {
      mfaUrl.protocol = "https:";
      mfaUrl.hostname = "monitoria.cam";
      mfaUrl.port = "";
    }

    mfaUrl.pathname = "/auth/mfa";
    mfaUrl.search = "";
    mfaUrl.searchParams.set("next", currentPath);
    return NextResponse.redirect(mfaUrl);
  }

  if (isPublicAuth && signedIn) {
    const destination = request.nextUrl.clone();
    const next =
      request.nextUrl.searchParams.get("next") || "/dashboard";

    if (mfaRequired && aal !== "aal2") {
      destination.pathname = "/auth/mfa";
      destination.search = "";
      destination.searchParams.set("next", next);
      return NextResponse.redirect(destination);
    }

    const safeNext =
      next.startsWith("/") && !next.startsWith("//")
        ? next
        : "/dashboard";

    if (
      process.env.VERCEL_ENV === "production" &&
      request.nextUrl.hostname.toLowerCase() === "monitoria.cam" &&
      isVipCustomerPath(safeNext)
    ) {
      return vipRedirectWithSharedSession(request, safeNext);
    }

    destination.pathname = safeNext;
    destination.search = "";
    return NextResponse.redirect(destination);
  }

  return response;
}

import { createServerClient } from "@supabase/ssr";
import {
  NextResponse,
  type NextRequest,
} from "next/server";

const protectedPrefixes = [
  "/dashboard",
  "/onboarding",
  "/reset-password",
  "/auth/mfa",
];

const publicAuthPrefixes = [
  "/login",
  "/forgot-password",
];

function booleanClaim(value: unknown) {
  return value === true || value === "true";
}

export async function updateSession(
  request: NextRequest,
) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, responseHeaders) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );

        response = NextResponse.next({ request });

        cookiesToSet.forEach(
          ({ name, value, options }) => {
            response.cookies.set(
              name,
              value,
              options,
            );
          },
        );

        if (responseHeaders) {
          Object.entries(responseHeaders).forEach(
            ([name, value]) => {
              response.headers.set(name, value);
            },
          );
        }
      },
    },
  });

  const { data, error } =
    await supabase.auth.getClaims();
  const claims =
    data?.claims &&
    typeof data.claims === "object"
      ? (data.claims as Record<string, unknown>)
      : null;
  const signedIn =
    !error && Boolean(claims?.sub);
  const pathname = request.nextUrl.pathname;
  const currentPath =
    pathname + request.nextUrl.search;
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname.startsWith(prefix),
  );
  const isPublicAuth = publicAuthPrefixes.some(
    (prefix) => pathname.startsWith(prefix),
  );
  const mfaRequired = booleanClaim(
    claims?.mfa_required,
  );
  const aal =
    typeof claims?.aal === "string"
      ? claims.aal
      : "aal1";

  if (isProtected && !signedIn) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      currentPath,
    );
    return NextResponse.redirect(loginUrl);
  }

  if (
    signedIn &&
    mfaRequired &&
    aal !== "aal2" &&
    !pathname.startsWith("/auth/mfa")
  ) {
    const mfaUrl = request.nextUrl.clone();
    mfaUrl.pathname = "/auth/mfa";
    mfaUrl.search = "";
    mfaUrl.searchParams.set(
      "next",
      currentPath,
    );
    return NextResponse.redirect(mfaUrl);
  }

  if (isPublicAuth && signedIn) {
    const destination = request.nextUrl.clone();

    if (mfaRequired && aal !== "aal2") {
      destination.pathname = "/auth/mfa";
      destination.search = "";
      destination.searchParams.set(
        "next",
        "/dashboard",
      );
    } else {
      destination.pathname = "/dashboard";
      destination.search = "";
    }

    return NextResponse.redirect(destination);
  }

  return response;
}

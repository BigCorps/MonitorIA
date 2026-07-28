import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const protectedPrefixes = ["/dashboard", "/onboarding", "/reset-password"];
const publicAuthPrefixes = ["/login", "/forgot-password"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, responseHeaders) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
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
  const signedIn = !error && Boolean(data?.claims?.sub);
  const pathname = request.nextUrl.pathname;

  if (protectedPrefixes.some((prefix) => pathname.startsWith(prefix)) && !signedIn) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (publicAuthPrefixes.some((prefix) => pathname.startsWith(prefix)) && signedIn) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

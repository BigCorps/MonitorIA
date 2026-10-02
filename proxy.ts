import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/src/lib/supabase/proxy";
import { appConfig } from "@/src/lib/app-config";
import { vipConfig } from "@/src/vip/config";

export async function proxy(request: NextRequest) {
  const hostname = request.nextUrl.hostname.toLowerCase();
  const pathname = request.nextUrl.pathname;
  const isMain = hostname === appConfig.domain;
  const isVip = hostname === vipConfig.domain;
  const isPreview = hostname.endsWith(".vercel.app");
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".local");

  if (process.env.VERCEL_ENV === "production" && !isMain && !isVip && !isPreview && !isLocal) {
    const canonical = request.nextUrl.clone();
    canonical.protocol = "https:";
    canonical.hostname = appConfig.domain;
    canonical.port = "";
    return NextResponse.redirect(canonical, 308);
  }

  if (isVip && pathname === "/") {
    const vipDashboard = request.nextUrl.clone();
    vipDashboard.pathname = "/vip/dashboard";
    vipDashboard.search = "";
    return NextResponse.redirect(vipDashboard, 307);
  }

  if (isVip && pathname === "/dashboard") {
    const vipDashboard = request.nextUrl.clone();
    vipDashboard.pathname = "/vip/dashboard";
    return NextResponse.redirect(vipDashboard, 307);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|\\.well-known/assetlinks\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

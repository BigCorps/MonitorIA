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
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local");

  if (
    process.env.VERCEL_ENV === "production" &&
    !isMain &&
    !isVip &&
    !isPreview &&
    !isLocal
  ) {
    const canonical = request.nextUrl.clone();
    canonical.protocol = "https:";
    canonical.hostname = appConfig.domain;
    canonical.port = "";
    return NextResponse.redirect(canonical, 308);
  }

  // A raiz do subdomínio é a landing pública. O rewrite mantém
  // https://vip.monitoria.cam/ como URL canônica no navegador.
  if (isVip && pathname === "/") {
    const landing = request.nextUrl.clone();
    landing.pathname = "/vip/landing";
    return NextResponse.rewrite(landing);
  }

  // Autenticação continua canônica no domínio principal.
  if (
    isVip &&
    (
      pathname === "/login" ||
      pathname === "/forgot-password" ||
      pathname.startsWith("/auth/")
    )
  ) {
    const authUrl = request.nextUrl.clone();
    authUrl.protocol = "https:";
    authUrl.hostname = appConfig.domain;
    authUrl.port = "";
    return NextResponse.redirect(authUrl, 307);
  }

  // Endereços antigos/compartilhados do dashboard entram no espaço VIP.
  if (isVip && pathname === "/dashboard") {
    const vipDashboard = request.nextUrl.clone();
    vipDashboard.pathname = "/vip/dashboard";
    return NextResponse.redirect(vipDashboard, 307);
  }

  // A rota interna da landing nunca deve virar URL pública no domínio principal.
  if (isMain && pathname === "/vip/landing") {
    const vipLanding = request.nextUrl.clone();
    vipLanding.protocol = "https:";
    vipLanding.hostname = vipConfig.domain;
    vipLanding.port = "";
    vipLanding.pathname = "/";
    return NextResponse.redirect(vipLanding, 308);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|\\.well-known/assetlinks\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

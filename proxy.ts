import {
  NextResponse,
  type NextRequest,
} from "next/server";
import { updateSession } from "@/src/lib/supabase/proxy";
import { appConfig } from "@/src/lib/app-config";

export async function proxy(request: NextRequest) {
  if (
    process.env.NODE_ENV === "production" &&
    request.nextUrl.hostname === `www.${appConfig.domain}`
  ) {
    const canonicalUrl = request.nextUrl.clone();

    canonicalUrl.protocol = "https:";
    canonicalUrl.hostname = appConfig.domain;
    canonicalUrl.port = "";

    return NextResponse.redirect(canonicalUrl, 308);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

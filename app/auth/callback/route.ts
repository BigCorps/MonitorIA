import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { normalizeNextPath } from "@/src/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = normalizeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
      const destination = forwardedHost ? `${forwardedProto}://${forwardedHost}${next}` : `${origin}${next}`;
      return NextResponse.redirect(destination);
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`);
}

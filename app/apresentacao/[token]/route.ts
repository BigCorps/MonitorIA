import { NextRequest, NextResponse } from "next/server";
import { getSalesTrialInvite } from "@/src/lib/sales-trial";
import { VIP_ASSIST_COOKIE } from "@/src/vip/assisted";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const invite = await getSalesTrialInvite(token).catch(() => null);

  if (!invite?.vipProjectId || !["active", "redeemed"].includes(invite.status)) {
    const invalid = new URL("/", request.url);
    invalid.searchParams.set("apresentacao", "invalida");
    return NextResponse.redirect(invalid, 307);
  }

  const target = new URL("/", request.url);
  const response = NextResponse.redirect(target, 307);
  const expiresAt = new Date(invite.expiresAt).getTime();
  const maxAge = Math.max(
    60,
    Math.min(7 * 24 * 60 * 60, Math.floor((expiresAt - Date.now()) / 1000)),
  );

  response.cookies.set(VIP_ASSIST_COOKIE, token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  return response;
}

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/src/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 },
    );
  }

  const value = process.env.AGENT_WINDOWS_DOWNLOAD_URL?.trim();
  if (!value) {
    return NextResponse.json(
      { ok: false, error: "installer_not_published" },
      { status: 503 },
    );
  }

  let target: URL;
  try {
    target = new URL(value);
  } catch {
    return NextResponse.json(
      { ok: false, error: "installer_url_invalid" },
      { status: 503 },
    );
  }

  if (target.protocol !== "https:") {
    return NextResponse.json(
      { ok: false, error: "installer_url_insecure" },
      { status: 503 },
    );
  }

  return NextResponse.redirect(target, 307);
}

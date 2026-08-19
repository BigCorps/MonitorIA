import { NextResponse } from "next/server";
import {
  installerUrlFor,
  isInstallerPlatform,
} from "@/src/lib/installer-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download público do Agent.
 *
 * Os binários já são públicos no GitHub Releases. Esta rota só oferece um
 * endereço estável em monitoria.cam para a página compartilhável /instalar.
 * Nenhum byte do instalador passa pela Vercel.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ platform: string }> },
) {
  const { platform } = await context.params;

  if (!isInstallerPlatform(platform)) {
    return NextResponse.json(
      { ok: false, error: "unknown_platform" },
      { status: 404 },
    );
  }

  const value = installerUrlFor(platform);
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

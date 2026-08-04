import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { installerUrlFor, isInstallerPlatform } from "@/src/lib/installer-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Redireciona para o instalador da plataforma pedida.
 *
 * Substitui a rota fixa /api/installer/windows, que continua funcionando por
 * ser o mesmo caminho. O binário vem de GitHub Releases; aqui só sai um 307,
 * então nenhum byte de download passa pela Vercel.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ platform: string }> },
) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 },
    );
  }

  const { platform } = await context.params;

  if (!isInstallerPlatform(platform)) {
    return NextResponse.json(
      { ok: false, error: "unknown_platform" },
      { status: 404 },
    );
  }

  const value = installerUrlFor(platform);

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

  // HTTPS obrigatório: um redirecionamento para HTTP permitiria troca do
  // binário no caminho, e o instalador é executado com privilégio de
  // administrador na máquina do cliente.
  if (target.protocol !== "https:") {
    return NextResponse.json(
      { ok: false, error: "installer_url_insecure" },
      { status: 503 },
    );
  }

  return NextResponse.redirect(target, 307);
}

import {
  NextResponse,
  type NextRequest,
} from "next/server";
import { updateSession } from "@/src/lib/supabase/proxy";
import { appConfig } from "@/src/lib/app-config";

export async function proxy(request: NextRequest) {
  // Canonicalização de host.
  //
  // Antes só tratava www. Agora qualquer host que não seja o canônico é
  // redirecionado — o domínio antigo, um apontamento errado, o que for.
  // Previews *.vercel.app e desenvolvimento local ficam de fora, senão
  // nenhum preview abriria.
  //
  // A origem precisa ser única porque OAuth e WebAuthn são amarrados a ela,
  // e porque uma TWA valida cada origem separadamente por Digital Asset
  // Links: trocar de origem dentro do app tira o usuário da TWA.
  const hostname = request.nextUrl.hostname.toLowerCase();
  const isCanonical = hostname === appConfig.domain;
  const isPreview = hostname.endsWith(".vercel.app");
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local");

  if (
    process.env.VERCEL_ENV === "production" &&
    !isCanonical &&
    !isPreview &&
    !isLocal
  ) {
    const canonicalUrl = request.nextUrl.clone();

    canonicalUrl.protocol = "https:";
    canonicalUrl.hostname = appConfig.domain;
    canonicalUrl.port = "";

    // 308 preserva método e corpo, e path e query vêm no clone().
    return NextResponse.redirect(canonicalUrl, 308);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    // O assetlinks.json precisa responder direto, sem passar pela sessão:
    // é o Chrome que busca esse arquivo para validar a TWA.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|\\.well-known/assetlinks\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

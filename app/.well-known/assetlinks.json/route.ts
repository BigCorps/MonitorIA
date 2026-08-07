import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 3600;

/**
 * Digital Asset Links — https://monitoria.cam/.well-known/assetlinks.json
 *
 * Este arquivo não existia no projeto. Sem ele, duas coisas quebram no
 * Android, e a segunda é provavelmente a causa do erro de RP ID:
 *
 * 1. A TWA não valida a origem e o Chrome abre o app como Custom Tab, com
 *    barra de endereço à mostra.
 *
 * 2. Passkeys não funcionam. Dentro do app Android a cerimônia WebAuthn não
 *    parte de uma origem `https://`, e sim de uma origem de aplicativo
 *    (`android:apk-key-hash:...`). Para o Chrome aceitar que esse aplicativo
 *    fale em nome de monitoria.cam, o domínio precisa declarar a relação
 *    `delegate_permission/common.get_login_creds`.
 *
 * A relação `get_login_creds` é o ponto que costuma faltar: quase todo
 * tutorial de TWA cita apenas `handle_all_urls`, que resolve a barra de
 * endereço e não resolve passkey nenhuma. As duas precisam estar presentes.
 *
 * CONFIGURAÇÃO (Vercel → Settings → Environment Variables, em Production):
 *
 *   TWA_PACKAGE_NAME          cam.monitoria.twa
 *   TWA_SHA256_FINGERPRINTS   AA:BB:CC:...  (separe várias por vírgula)
 *
 * A fingerprint precisa ser a da chave que ASSINA a versão instalada. Se o
 * app usa Play App Signing, é a do "app signing key" na Play Console, e não
 * a da chave de upload. Se você também testa um build local de debug, some
 * as duas fingerprints, separadas por vírgula.
 *
 * Sem as variáveis definidas, a rota responde 404 de propósito: publicar um
 * assetlinks.json vazio ou com dado inventado é pior que não publicar, pois
 * o Chrome guarda o resultado da validação em cache.
 */
type AssetLink = {
  relation: string[];
  target: {
    namespace: string;
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
};

function parseFingerprints(raw: string | undefined): string[] {
  if (!raw) return [];

  return raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);
}

export async function GET() {
  const packageName = process.env.TWA_PACKAGE_NAME?.trim();
  const fingerprints = parseFingerprints(
    process.env.TWA_SHA256_FINGERPRINTS,
  );

  if (!packageName || fingerprints.length === 0) {
    return new NextResponse(null, { status: 404 });
  }

  const statements: AssetLink[] = [
    {
      relation: [
        // Abre os links do domínio dentro do app, sem barra de endereço.
        "delegate_permission/common.handle_all_urls",
        // Autoriza o app a usar as credenciais do domínio. É esta que
        // habilita passkey dentro da TWA.
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return NextResponse.json(statements, {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  });
}

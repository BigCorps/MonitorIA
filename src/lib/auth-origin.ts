import { appConfig } from "@/src/lib/app-config";

/**
 * Origem canônica de autenticação.
 *
 * OAuth PKCE e WebAuthn/passkeys são amarrados à origem do navegador. Se a
 * cerimônia começa em www.monitoria.cam, em um alias *.vercel.app ou no
 * domínio antigo, o navegador e o Supabase enxergam origens diferentes e o
 * fluxo quebra — às vezes silenciosamente, terminando na landing.
 *
 * Fonte única. Não escreva "https://monitoria.cam" à mão em nenhum arquivo
 * de autenticação; importe daqui.
 */
export const AUTH_CANONICAL_ORIGIN = appConfig.url;
export const AUTH_CANONICAL_HOST = appConfig.domain;

/**
 * Hosts em que NÃO canonicalizamos.
 *
 * Decisão de projeto: em vez de detectar produção por variável de ambiente,
 * decidimos pelo hostname. O motivo é prático — `VERCEL_ENV` não existe no
 * browser a menos que alguém crie `NEXT_PUBLIC_VERCEL_ENV`, e este projeto
 * não tem essa variável. Depender dela deixaria o helper silenciosamente
 * inerte em produção, que é exatamente o defeito que estamos corrigindo.
 *
 * Decidir por hostname também é mais seguro: um host desconhecido passa a
 * ser canonicalizado por padrão, em vez de liberado por padrão.
 */
function isDevelopmentHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localhost")
  );
}

/** Previews da Vercel continuam funcionando na própria origem. */
function isPreviewHost(hostname: string): boolean {
  return hostname.endsWith(".vercel.app");
}

/**
 * Núcleo puro, sem `window`, para poder ser testado.
 *
 * Retorna a URL canônica equivalente, ou `null` quando a URL atual já está
 * numa origem aceitável. Preserva pathname, query string e hash.
 *
 * Exemplo:
 *   https://www.monitoria.cam/login?next=%2Fdashboard
 *   → https://monitoria.cam/login?next=%2Fdashboard
 */
export function canonicalAuthUrl(currentHref: string): string | null {
  let current: URL;

  try {
    current = new URL(currentHref);
  } catch {
    return null;
  }

  const hostname = current.hostname.toLowerCase();

  if (
    hostname === AUTH_CANONICAL_HOST ||
    isDevelopmentHost(hostname) ||
    isPreviewHost(hostname)
  ) {
    return null;
  }

  // Qualquer outro host — www.monitoria.cam, o domínio antigo, um domínio
  // apontado por engano — vai para a origem canônica.
  const canonical = new URL(current.toString());

  canonical.protocol = "https:";
  canonical.hostname = AUTH_CANONICAL_HOST;
  canonical.port = "";

  return canonical.toString();
}

/**
 * Garante que a página está na origem canônica ANTES de iniciar OAuth ou
 * WebAuthn.
 *
 * Retorna `false` quando iniciou a navegação. Quem chama deve interromper o
 * fluxo imediatamente: a cerimônia não pode começar em uma origem que está
 * prestes a mudar.
 *
 *   if (!ensureCanonicalAuthOrigin()) return;
 */
export function ensureCanonicalAuthOrigin(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  const target = canonicalAuthUrl(window.location.href);

  if (!target) {
    return true;
  }

  window.location.replace(target);
  return false;
}

/**
 * Callback absoluto de OAuth.
 *
 * Substitui `${window.location.origin}/auth/callback`, que produzia um
 * redirectTo diferente conforme o host de entrada. O Supabase só aceita
 * redirectTo que esteja na lista de Redirect URLs; quando não está, ele cai
 * na Site URL — que é a landing. Era esse o "autentica e volta para a home".
 *
 * `next` precisa vir já sanitizado por `normalizeNextPath`.
 */
export function authCallbackUrl(next: string): string {
  const url = new URL("/auth/callback", AUTH_CANONICAL_ORIGIN);

  url.searchParams.set("next", next);

  return url.toString();
}

/** WebAuthn não existe em todo navegador nem em toda WebView. */
export function supportsWebAuthn(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.credentials)
  );
}

/**
 * Diagnóstico de passkey.
 *
 * Só origem, hostname, protocolo e mensagem. Nunca challenge, credential ID
 * ou token — esses não podem ir para o console em hipótese alguma.
 */
export function logPasskeyDiagnostics(stage: string, error: unknown): void {
  if (typeof window === "undefined") return;

  console.error("[MonitorIA Passkey]", {
    stage,
    href: window.location.href,
    origin: window.location.origin,
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    expectedOrigin: AUTH_CANONICAL_ORIGIN,
    expectedRpId: AUTH_CANONICAL_HOST,
    message: error instanceof Error ? error.message : String(error ?? ""),
  });
}

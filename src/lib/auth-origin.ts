import { appConfig } from "@/src/lib/app-config";

/**
 * OAuth PKCE and WebAuthn/passkeys are bound to the browser origin.
 * Never start either flow on www.monitoria.cam when monitoria.cam is
 * the canonical application origin.
 */
export function ensureCanonicalAuthOrigin(): boolean {
  if (
    typeof window === "undefined" ||
    process.env.NODE_ENV !== "production"
  ) {
    return true;
  }

  if (window.location.hostname === appConfig.domain) {
    return true;
  }

  if (
    window.location.hostname ===
    `www.${appConfig.domain}`
  ) {
    const canonicalUrl = new URL(window.location.href);

    canonicalUrl.protocol = "https:";
    canonicalUrl.hostname = appConfig.domain;
    canonicalUrl.port = "";

    window.location.replace(canonicalUrl.toString());
    return false;
  }

  return true;
}

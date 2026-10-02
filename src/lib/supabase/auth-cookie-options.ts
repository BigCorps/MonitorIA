export const MONITORIA_SHARED_COOKIE_DOMAIN = ".monitoria.cam";

function isMonitoriaProductionHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "monitoria.cam" || host.endsWith(".monitoria.cam");
}

export function browserAuthCookieOptions() {
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    isMonitoriaProductionHost(window.location.hostname)
  ) {
    return {
      domain: MONITORIA_SHARED_COOKIE_DOMAIN,
      path: "/",
      sameSite: "lax" as const,
      secure: true,
    };
  }

  return { path: "/", sameSite: "lax" as const };
}

export function serverAuthCookieOptions() {
  if (process.env.VERCEL_ENV === "production") {
    return {
      domain: MONITORIA_SHARED_COOKIE_DOMAIN,
      path: "/",
      sameSite: "lax" as const,
      secure: true,
    };
  }

  return { path: "/", sameSite: "lax" as const };
}

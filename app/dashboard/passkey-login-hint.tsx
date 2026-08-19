"use client";

import { useEffect } from "react";
import {
  PASSKEY_LOGIN_HINT_COOKIE,
  PASSKEY_LOGIN_HINT_MAX_AGE,
} from "@/src/lib/passkey-login-hint";

type Props = {
  enabled: boolean | null;
};

export function PasskeyLoginHint({
  enabled,
}: Props) {
  useEffect(() => {
    if (enabled === null) return;

    const secure =
      window.location.protocol === "https:"
        ? "; Secure"
        : "";

    if (enabled) {
      document.cookie =
        `${PASSKEY_LOGIN_HINT_COOKIE}=1; ` +
        `Path=/; Max-Age=${PASSKEY_LOGIN_HINT_MAX_AGE}; ` +
        `SameSite=Lax${secure}`;
      return;
    }

    document.cookie =
      `${PASSKEY_LOGIN_HINT_COOKIE}=; ` +
      `Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }, [enabled]);

  return null;
}

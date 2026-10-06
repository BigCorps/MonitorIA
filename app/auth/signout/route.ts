import { revalidatePath } from "next/cache";
import {
  NextResponse,
  type NextRequest,
} from "next/server";
import { appConfig } from "@/src/lib/app-config";
import { createClient } from "@/src/lib/supabase/server";
import {
  PASSKEY_LOGIN_HINT_COOKIE,
  PASSKEY_LOGIN_HINT_MAX_AGE,
  passkeyLoginReady,
} from "@/src/lib/passkey-login-hint";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: settingsData,
    error: settingsError,
  } = await supabase.rpc(
    "get_current_user_auth_settings",
  );

  const passkeyReady = settingsError
    ? null
    : passkeyLoginReady(settingsData);

  await supabase.auth.signOut();
  revalidatePath("/", "layout");

  const response = NextResponse.redirect(
    new URL(
      "/login?message=Sess%C3%A3o%20encerrada.",
      appConfig.url,
    ),
    { status: 302 },
  );

  if (passkeyReady === true) {
    response.cookies.set(
      PASSKEY_LOGIN_HINT_COOKIE,
      "1",
      {
        path: "/",
        maxAge: PASSKEY_LOGIN_HINT_MAX_AGE,
        sameSite: "lax",
        secure:
          new URL(request.url).protocol === "https:",
      },
    );
  } else if (passkeyReady === false) {
    response.cookies.delete(
      PASSKEY_LOGIN_HINT_COOKIE,
    );
  }

  const secure = new URL(request.url).protocol === "https:";

  for (const cookie of request.cookies.getAll()) {
    if (!cookie.name.startsWith("sb-")) continue;

    const common = [
      `${cookie.name}=`,
      "Path=/",
      "Max-Age=0",
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "SameSite=Lax",
      secure ? "Secure" : "",
    ].filter(Boolean);

    response.headers.append("Set-Cookie", common.join("; "));
    response.headers.append(
      "Set-Cookie",
      [...common, "Domain=.monitoria.cam"].join("; "),
    );
  }

  return response;
}

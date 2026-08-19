import { revalidatePath } from "next/cache";
import {
  NextResponse,
  type NextRequest,
} from "next/server";
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
      request.url,
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

  return response;
}

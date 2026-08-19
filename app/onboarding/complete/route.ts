import {
  NextResponse,
  type NextRequest,
} from "next/server";
import {
  getAuthenticatedUser,
} from "@/src/lib/auth";
import {
  AUTH_CANONICAL_ORIGIN,
} from "@/src/lib/auth-origin";
import {
  completeGuidedOnboarding,
} from "@/src/lib/complete-guided-onboarding";
import {
  hasRequiredOnboardingIntake,
  readOnboardingIntake,
} from "@/src/lib/onboarding-intake";
import {
  clearPendingOnboarding,
  readPendingOnboarding,
} from "@/src/lib/pending-onboarding";

function destination(path: string) {
  return new URL(
    path,
    AUTH_CANONICAL_ORIGIN,
  );
}

export async function GET(
  _request: NextRequest,
) {
  const user =
    await getAuthenticatedUser();

  if (!user) {
    return NextResponse.redirect(
      destination(
        "/login?message=" +
          encodeURIComponent(
            "Entre para continuar sua configuração.",
          ),
      ),
    );
  }

  const pending =
    await readPendingOnboarding();
  const metadata =
    readOnboardingIntake(
      user.user_metadata,
    );
  const intake =
    pending &&
    hasRequiredOnboardingIntake(
      pending,
    )
      ? pending
      : metadata;

  if (
    !hasRequiredOnboardingIntake(
      intake,
    )
  ) {
    return NextResponse.redirect(
      destination("/onboarding"),
    );
  }

  try {
    await completeGuidedOnboarding(
      user,
      intake,
    );
    await clearPendingOnboarding();

    return NextResponse.redirect(
      destination(
        "/dashboard?message=" +
          encodeURIComponent(
            "Cadastro concluído. Vamos conectar o computador da loja.",
          ),
      ),
    );
  } catch (error) {
    console.error(
      "[MonitorIA Onboarding] conclusão automática:",
      error instanceof Error
        ? error.message
        : String(error),
    );

    return NextResponse.redirect(
      destination(
        "/onboarding?error=" +
          encodeURIComponent(
            "Seu acesso foi criado, mas não conseguimos concluir a empresa e o local automaticamente. Confirme os dados abaixo.",
          ),
      ),
    );
  }
}

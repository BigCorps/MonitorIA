import { appConfig } from "@/src/lib/app-config";

type TrialCaptureEndedEmail = {
  recipientEmail: string;
  organizationName: string;
  planName: string;
  explorationEndsAt: string | null;
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function trialEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function notifyTrialCaptureEnded(input: TrialCaptureEndedEmail) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false as const, error: "resend_not_configured" };

  const from = process.env.RESEND_FROM?.trim() || "onboarding@resend.dev";
  const plansUrl = `${appConfig.url}/dashboard/plans`;
  const explorationDate = formatDate(input.explorationEndsAt);

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#12212d;max-width:620px;margin:0 auto">
      <h2>Seu período gratuito de monitoramento terminou</h2>
      <p>As 24 horas de captura gratuita da <strong>${escapeHtml(input.organizationName)}</strong> foram concluídas.</p>
      <p>A câmera não continuará gerando novos acontecimentos durante o período de exploração.
      Você ainda pode consultar o que foi analisado ${explorationDate ? `até <strong>${escapeHtml(explorationDate)}</strong>` : "por tempo limitado"}.</p>
      <p>Plano testado: <strong>${escapeHtml(input.planName)}</strong></p>
      <p><a href="${plansUrl}">Ver planos e continuar</a></p>
    </div>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `MonitorIA <${from}>`,
        to: [input.recipientEmail],
        subject: "Seu período gratuito de monitoramento terminou",
        html,
      }),
    });

    if (!response.ok) {
      return { ok: false as const, error: `resend_${response.status}:${await response.text()}`.slice(0, 1000) };
    }
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message.slice(0, 1000) : "trial_email_unknown_error" };
  }
}

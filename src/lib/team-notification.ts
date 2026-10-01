import { appConfig } from "@/src/lib/app-config";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function teamEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendTeamInvitation(input: {
  email: string;
  organizationName: string;
  inviterName: string;
  roleLabel: string;
  inviteUrl: string;
  expiresAt: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false as const, error: "resend_not_configured" };
  }

  const sender =
    process.env.RESEND_FROM?.trim() || "onboarding@resend.dev";

  const expires = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(input.expiresAt));

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: sender,
      to: [input.email],
      subject: `Convite para a equipe ${input.organizationName} no MonitorIA`,
      text:
        `${input.inviterName} convidou você para a equipe ${input.organizationName} ` +
        `no MonitorIA como ${input.roleLabel}.\n\n` +
        `Aceite o convite: ${input.inviteUrl}\n\n` +
        `O convite expira em ${expires}.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#263f57;line-height:1.6">
          <h2 style="color:#176c5c">Convite para o MonitorIA</h2>
          <p><strong>${escapeHtml(input.inviterName)}</strong> convidou você para a equipe <strong>${escapeHtml(input.organizationName)}</strong>.</p>
          <p>Nível de acesso: <strong>${escapeHtml(input.roleLabel)}</strong>.</p>
          <p style="margin:28px 0">
            <a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;background:#1fc7a6;color:#08241f;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:9px">Aceitar convite</a>
          </p>
          <p>O convite expira em ${escapeHtml(expires)}.</p>
          <p style="color:#71849a;font-size:13px">Se você não esperava este convite, ignore esta mensagem.</p>
          <p style="color:#71849a;font-size:12px">${escapeHtml(appConfig.domain)}</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("Falha ao enviar convite da equipe:", response.status, body.slice(0, 500));
    return { ok: false as const, error: "email_send_failed" };
  }

  return { ok: true as const };
}

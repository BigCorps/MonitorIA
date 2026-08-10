import { appConfig } from "@/src/lib/app-config";

/**
 * Aviso por e-mail quando alguém registra uma solicitação de privacidade.
 *
 * Sem isto, o pedido fica só na tabela `privacy_requests` e só é visto por
 * quem lembrar de olhar. Como o prazo legal é de 15 dias, perder um pedido é
 * perder o prazo.
 *
 * Usa a API da Resend por HTTP puro, sem instalar dependência nenhuma. Se a
 * variável não estiver configurada, a função registra no log e segue — o
 * pedido do cliente NUNCA falha por causa do e-mail.
 *
 * CONFIGURAR (Vercel → Settings → Environment Variables → Production):
 *
 *   RESEND_API_KEY        chave criada em resend.com (o plano gratuito basta)
 *   PRIVACY_ALERT_EMAIL   para onde mandar o aviso
 *                         (opcional; sem ela usa o e-mail de privacidade)
 *
 * O domínio remetente precisa estar verificado na Resend. Enquanto não
 * estiver, use `onboarding@resend.dev` em RESEND_FROM para testar.
 */

type PrivacyRequestAlert = {
  protocol: string;
  requestType: string;
  scope: string;
  details: string;
  userEmail: string | null;
  organizationName: string;
  organizationId: string;
  /** Vem de privacy_requests.response_due_at, quando a tabela já calcula. */
  dueAt?: string | null;
};

const TIPOS: Record<string, string> = {
  confirmation: "Confirmação de tratamento",
  access: "Acesso aos dados",
  correction: "Correção",
  information: "Informação",
  restriction: "Restrição",
  deletion: "EXCLUSÃO",
  portability: "Portabilidade",
  opposition: "Oposição",
  review: "Revisão de decisão automatizada",
};

const ESCOPOS: Record<string, string> = {
  account: "Conta",
  monitoring: "Monitoramento",
  all: "Tudo",
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function notifyPrivacyRequest(
  alert: PrivacyRequestAlert,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    console.warn(
      `[privacidade] RESEND_API_KEY ausente. Solicitação ${alert.protocol} ` +
        `(${alert.requestType}) registrada apenas no banco.`,
    );
    return;
  }

  const destino =
    process.env.PRIVACY_ALERT_EMAIL?.trim() || appConfig.legal.privacyEmail;
  const remetente =
    process.env.RESEND_FROM?.trim() || "onboarding@resend.dev";

  const tipo = TIPOS[alert.requestType] ?? alert.requestType;
  const escopo = ESCOPOS[alert.scope] ?? alert.scope;
  const urgente = alert.requestType === "deletion";

  const assunto = urgente
    ? `[MonitorIA] EXCLUSÃO solicitada — ${alert.organizationName}`
    : `[MonitorIA] Solicitação de privacidade — ${alert.organizationName}`;

  const corpo = `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#12212d">
      <h2 style="margin:0 0 16px">${escapeHtml(tipo)}</h2>
      <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
        <tr><td style="color:#64748b">Protocolo</td><td><strong>${escapeHtml(alert.protocol)}</strong></td></tr>
        <tr><td style="color:#64748b">Abrangência</td><td>${escapeHtml(escopo)}</td></tr>
        <tr><td style="color:#64748b">Empresa</td><td>${escapeHtml(alert.organizationName)}</td></tr>
        <tr><td style="color:#64748b">ID da empresa</td><td><code>${escapeHtml(alert.organizationId)}</code></td></tr>
        <tr><td style="color:#64748b">Solicitante</td><td>${escapeHtml(alert.userEmail ?? "não informado")}</td></tr>
      </table>
      <p style="margin:16px 0 4px;color:#64748b;font-size:14px">Descrição</p>
      <p style="margin:0;padding:12px;background:#f8fbfd;border:1px solid #e2ebf0;border-radius:8px;font-size:14px">
        ${escapeHtml(alert.details)}
      </p>
      <p style="margin-top:20px;padding:12px;background:${urgente ? "#fef3f2" : "#f1fbf8"};border-radius:8px;font-size:14px">
        <strong>Prazo legal: 15 dias</strong>, conforme a LGPD.
        ${alert.dueAt ? `Vence em ${escapeHtml(new Date(alert.dueAt).toLocaleDateString("pt-BR"))}.` : ""}
      </p>
      <p style="font-size:13px;color:#64748b">
        Abrir no painel:
        <a href="${appConfig.url}/dashboard/admin">${appConfig.url}/dashboard/admin</a>
      </p>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `MonitorIA <${remetente}>`,
        to: [destino],
        subject: assunto,
        html: corpo,
      }),
    });

    if (!response.ok) {
      // Falha de e-mail não pode derrubar o pedido do cliente. O registro
      // no banco já existe; o log serve para conferir depois.
      console.error(
        `[privacidade] Falha ao avisar sobre ${alert.protocol}: ` +
          `${response.status} ${await response.text().catch(() => "")}`,
      );
    }
  } catch (error) {
    console.error(
      `[privacidade] Erro ao avisar sobre ${alert.protocol}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

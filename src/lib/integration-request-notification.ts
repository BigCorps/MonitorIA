import { appConfig } from "@/src/lib/app-config";

type IntegrationRequestAlert = {
  requestId: string;
  organizationName: string;
  organizationId: string;
  requesterEmail: string | null;
  contactPhone: string | null;
  systems: string[];
  useCases: string[];
  businessType: string;
  locationsCount: number;
  camerasCount: number;
  versionNotes: string | null;
  integrationAccess: string;
  supplierContact: string | null;
  otherSystem: string | null;
  details: string | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function text(value: string | null | undefined) {
  return escapeHtml(value?.trim() || "Não informado");
}

function list(values: string[]) {
  return values.length
    ? `<ul style="margin:6px 0 0;padding-left:18px">${values
        .map((value) => `<li>${escapeHtml(value)}</li>`)
        .join("")}</ul>`
    : "Não informado";
}

export async function notifyIntegrationRequest(alert: IntegrationRequestAlert) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false as const, error: "resend_not_configured" };
  }

  const destination =
    process.env.INTEGRATION_REQUEST_EMAIL?.trim() || appConfig.legal.legalEmail;
  const sender = process.env.RESEND_FROM?.trim() || "onboarding@resend.dev";

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color:#12212d;max-width:720px;margin:0 auto">
      <div style="padding:18px 20px;border-radius:14px;background:#effcf9;border:1px solid #b9e9dc">
        <div style="font-size:11px;font-weight:800;letter-spacing:.08em;color:#159278">MONITORIA · NOVA SOLICITAÇÃO</div>
        <h2 style="margin:6px 0 0">Avaliação de integração</h2>
      </div>

      <table cellpadding="7" style="margin-top:18px;border-collapse:collapse;font-size:14px;width:100%">
        <tr><td style="color:#64748b;width:190px">Empresa</td><td><strong>${text(alert.organizationName)}</strong></td></tr>
        <tr><td style="color:#64748b">ID da empresa</td><td><code>${text(alert.organizationId)}</code></td></tr>
        <tr><td style="color:#64748b">Solicitante</td><td>${text(alert.requesterEmail)}</td></tr>
        <tr><td style="color:#64748b">WhatsApp / telefone</td><td>${text(alert.contactPhone)}</td></tr>
        <tr><td style="color:#64748b">Tipo de negócio</td><td>${text(alert.businessType)}</td></tr>
        <tr><td style="color:#64748b">Locais no piloto</td><td>${alert.locationsCount}</td></tr>
        <tr><td style="color:#64748b">Câmeras no piloto</td><td>${alert.camerasCount}</td></tr>
        <tr><td style="color:#64748b">Acesso de integração</td><td>${text(alert.integrationAccess)}</td></tr>
      </table>

      <div style="margin-top:18px;padding:14px;border:1px solid #e1e9ef;border-radius:12px;background:#fff">
        <strong>Sistemas selecionados</strong>
        ${list(alert.systems)}
      </div>

      <div style="margin-top:12px;padding:14px;border:1px solid #e1e9ef;border-radius:12px;background:#fff">
        <strong>Objetivos</strong>
        ${list(alert.useCases)}
      </div>

      <table cellpadding="7" style="margin-top:14px;border-collapse:collapse;font-size:14px;width:100%">
        <tr><td style="color:#64748b;width:190px">Outro sistema</td><td>${text(alert.otherSystem)}</td></tr>
        <tr><td style="color:#64748b">Versão / observação técnica</td><td>${text(alert.versionNotes)}</td></tr>
        <tr><td style="color:#64748b">Contato do fornecedor</td><td>${text(alert.supplierContact)}</td></tr>
      </table>

      <p style="margin:18px 0 5px;color:#64748b;font-size:13px">Detalhes do caso</p>
      <div style="padding:13px;border-radius:10px;background:#f7fafc;border:1px solid #e1e9ef;font-size:14px;white-space:pre-wrap">${text(alert.details)}</div>

      <p style="margin-top:18px;font-size:12px;color:#64748b">
        Solicitação: <code>${text(alert.requestId)}</code><br />
        Abrir integrações: <a href="${appConfig.url}/dashboard/integrations">${appConfig.url}/dashboard/integrations</a>
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
        from: `MonitorIA <${sender}>`,
        to: [destination],
        subject: `[MonitorIA] Nova solicitação de integração — ${alert.organizationName}`,
        html,
      }),
    });

    if (!response.ok) {
      return {
        ok: false as const,
        error: `resend_${response.status}:${await response.text()}`.slice(0, 1000),
      };
    }

    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message.slice(0, 1000)
          : "integration_email_unknown_error",
    };
  }
}

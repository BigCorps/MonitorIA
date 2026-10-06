import { appConfig } from "@/src/lib/app-config";
import { vipConfig } from "@/src/vip/config";

type MailResult = { ok: true } | { ok: false; error: string };

type VipLeadNotificationInput = {
  requestId: string;
  leadName: string;
  leadEmail: string;
  companyName: string;
  phone: string;
  projectKind: string;
  expectedCameraCount: number;
  objective: string | null;
  sellerName: string | null;
  sellerEmail: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sender() {
  const configured = process.env.RESEND_FROM?.trim();

  if (configured) {
    const bracketEmail = configured.match(/<([^>]+)>$/)?.[1]?.trim();
    const email = bracketEmail || configured;
    return `MonitorIA <${email}>`;
  }

  if (process.env.VERCEL_ENV === "production") {
    console.error("MonitorIA VIP: RESEND_FROM não está configurado em produção.");
    return null;
  }

  return "MonitorIA <onboarding@resend.dev>";
}

async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "resend_not_configured" };

  const from = sender();
  if (!from) return { ok: false, error: "resend_from_not_configured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        error: `resend_${response.status}:${body}`.slice(0, 800),
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message.slice(0, 800)
          : "vip_lead_email_unknown_error",
    };
  }
}

function kindLabel(value: string) {
  const labels: Record<string, string> = {
    enterprise: "Média / grande empresa",
    large_monitoring: "Empresa / central de segurança",
    scientific: "Projeto científico",
    other: "Projeto especial",
  };
  return labels[value] ?? value;
}

export async function notifyVipLeadRequest(input: VipLeadNotificationInput) {
  const sellerEmail = input.sellerEmail?.trim().toLowerCase() || null;
  const sellerName = input.sellerName?.trim() || "Especialista VIP";
  const objective = input.objective?.trim() || "Não informado";
  const commercialUrl = `${appConfig.url}/comercial/vip`;

  const seller: MailResult = sellerEmail
    ? await sendEmail({
        to: sellerEmail,
        subject: `[MonitorIA VIP] Novo interesse — ${input.companyName}`,
        text: [
          "Novo interesse recebido pela landing do MonitorIA VIP.",
          "",
          `Empresa: ${input.companyName}`,
          `Contato: ${input.leadName}`,
          `E-mail: ${input.leadEmail}`,
          `Telefone: ${input.phone}`,
          `Projeto: ${kindLabel(input.projectKind)}`,
          `Câmeras previstas: ${input.expectedCameraCount}`,
          `Objetivo: ${objective}`,
          "",
          `Abrir carteira VIP: ${commercialUrl}`,
          `Solicitação: ${input.requestId}`,
        ].join("\n"),
        html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;background:#0b0c0f;color:#f7f5ee;padding:28px;border-radius:18px">
          <div style="font-size:11px;font-weight:800;letter-spacing:.14em;color:#d8ac42">MONITORIA VIP · NOVO INTERESSE</div>
          <h2 style="margin:8px 0 18px;font-size:26px">${escapeHtml(input.companyName)}</h2>
          <table cellpadding="7" style="border-collapse:collapse;width:100%;font-size:14px;color:#ded9cc">
            <tr><td style="color:#8f8d86;width:155px">Contato</td><td><strong>${escapeHtml(input.leadName)}</strong></td></tr>
            <tr><td style="color:#8f8d86">E-mail</td><td>${escapeHtml(input.leadEmail)}</td></tr>
            <tr><td style="color:#8f8d86">Telefone</td><td>${escapeHtml(input.phone)}</td></tr>
            <tr><td style="color:#8f8d86">Projeto</td><td>${escapeHtml(kindLabel(input.projectKind))}</td></tr>
            <tr><td style="color:#8f8d86">Câmeras previstas</td><td><strong>${input.expectedCameraCount}</strong></td></tr>
          </table>
          <div style="margin-top:18px;padding:14px;border:1px solid rgba(220,180,77,.22);border-radius:10px;background:#11100c">
            <div style="font-size:11px;color:#b98d2c;font-weight:800;letter-spacing:.08em">OBJETIVO</div>
            <div style="margin-top:7px;color:#c9c3b5;white-space:pre-wrap">${escapeHtml(objective)}</div>
          </div>
          <p style="margin:24px 0 0"><a href="${escapeHtml(commercialUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:linear-gradient(112deg,#8a5c12,#e0bd60);color:#140f06;text-decoration:none;font-weight:800">Abrir carteira VIP</a></p>
          <p style="margin-top:22px;color:#6f706d;font-size:11px">Responsável: ${escapeHtml(sellerName)} · Solicitação ${escapeHtml(input.requestId)}</p>
        </div>`,
      })
    : { ok: false, error: "seller_email_unavailable" };

  const lead = await sendEmail({
    to: input.leadEmail,
    subject: "Recebemos seu interesse no MonitorIA VIP",
    text: [
      `Olá, ${input.leadName}.`,
      "",
      `Recebemos o interesse da ${input.companyName} no MonitorIA VIP.`,
      `Seu projeto informou aproximadamente ${input.expectedCameraCount} câmeras.`,
      "",
      `${sellerName} recebeu seus dados e dará continuidade ao contato.`,
      "",
      `MonitorIA VIP — ${vipConfig.url}`,
    ].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#e9e5db;background:#0b0c0f;padding:30px;border-radius:18px">
      <div style="font-size:11px;font-weight:800;letter-spacing:.14em;color:#d8ac42">MONITORIA VIP</div>
      <h2 style="margin:8px 0 14px;color:#fff">Recebemos seu interesse.</h2>
      <p style="line-height:1.65;color:#bdb8ad">Olá, <strong style="color:#f7f5ee">${escapeHtml(input.leadName)}</strong>.</p>
      <p style="line-height:1.65;color:#bdb8ad">Os dados da <strong style="color:#f7f5ee">${escapeHtml(input.companyName)}</strong> foram recebidos com sucesso. Você informou aproximadamente <strong style="color:#e0bd60">${input.expectedCameraCount} câmeras</strong>.</p>
      <p style="line-height:1.65;color:#bdb8ad"><strong style="color:#f7f5ee">${escapeHtml(sellerName)}</strong> recebeu a oportunidade e dará continuidade ao contato para entender o cenário e preparar a melhor demonstração.</p>
      <p style="margin-top:24px"><a href="${escapeHtml(vipConfig.url)}" style="color:#e0bd60;font-weight:700">MonitorIA VIP</a></p>
      <p style="margin-top:24px;color:#696a67;font-size:11px">Se você não enviou este formulário, pode ignorar esta mensagem.</p>
    </div>`,
  });

  return { seller, lead };
}

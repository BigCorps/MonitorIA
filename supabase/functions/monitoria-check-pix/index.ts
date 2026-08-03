import { createClient } from "npm:@supabase/supabase-js@2.110.9";
import {
  bankAmountToCents,
  bankResponseData,
  normalizeBankStatus,
  PAID_BANK_STATUSES,
} from "../_shared/pix.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BANCO_INTER_API_KEY =
  Deno.env.get("BANCO_INTER_API_KEY") ?? "";
const BRIDGE_BASE_URL = (
  Deno.env.get("BANCO_INTER_BRIDGE_BASE_URL") ??
  "https://inter.btsolucao.com.br"
).replace(/\/$/, "");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowed = new Set([
    "https://monitoria.cam",
    "https://www.monitoria.cam",
    "http://localhost:3000",
    Deno.env.get("APP_URL")?.replace(/\/$/, "") ?? "",
  ]);

  return {
    "Access-Control-Allow-Origin": allowed.has(origin)
      ? origin
      : "https://monitoria.cam",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

function uuid(value: unknown) {
  const candidate = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    candidate,
  )
    ? candidate
    : null;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function authenticatedUser(request: Request) {
  const token = bearerToken(request);
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

async function canManage(organizationId: string, userId: string) {
  const { data, error } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  return !error && ["owner", "admin"].includes(String(data?.role));
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return json(request, { success: false, error: "method_not_allowed" }, 405);
  }

  try {
    if (!BANCO_INTER_API_KEY) {
      return json(
        request,
        {
          success: false,
          error: "banco_inter_not_configured",
          message: "A chave do Banco Inter ainda não foi configurada.",
        },
        503,
      );
    }

    const user = await authenticatedUser(request);
    if (!user) {
      return json(request, { success: false, error: "unauthorized" }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const paymentId = uuid((body as Record<string, unknown>).payment_id);

    if (!paymentId) {
      return json(
        request,
        { success: false, error: "invalid_payment_id" },
        400,
      );
    }

    const { data: payment, error: paymentError } = await admin
      .from("billing_pix_payments")
      .select(
        "id,organization_id,invoice_id,status,txid,amount_cents,expires_at,confirmed_at,bank_status,error_code,error_message",
      )
      .eq("id", paymentId)
      .maybeSingle();

    if (paymentError || !payment) {
      return json(request, { success: false, error: "payment_not_found" }, 404);
    }

    if (!(await canManage(String(payment.organization_id), user.id))) {
      return json(request, { success: false, error: "not_authorized" }, 403);
    }

    const { data: invoice } = await admin
      .from("billing_invoices")
      .select(
        "id,invoice_number,status,service_period_start,service_period_end,total_cents,paid_at",
      )
      .eq("id", payment.invoice_id)
      .maybeSingle();

    if (payment.status === "confirmed" || invoice?.status === "paid") {
      return json(request, {
        success: true,
        status: "paid",
        payment_id: payment.id,
        invoice_id: payment.invoice_id,
        invoice_number: invoice?.invoice_number ?? null,
        paid_at: payment.confirmed_at ?? invoice?.paid_at ?? null,
        period_start: invoice?.service_period_start ?? null,
        period_end: invoice?.service_period_end ?? null,
        message: "Pagamento já confirmado.",
      });
    }

    if (["expired", "cancelled", "failed"].includes(String(payment.status))) {
      return json(request, {
        success: false,
        status: payment.status,
        payment_id: payment.id,
        error: payment.error_code ?? `payment_${payment.status}`,
        message:
          payment.error_message ?? "Esta cobrança não está mais disponível.",
      });
    }

    if (
      payment.expires_at &&
      new Date(String(payment.expires_at)).getTime() <= Date.now()
    ) {
      await admin.rpc("expire_monitoria_pix_payments");
      return json(request, {
        success: false,
        status: "expired",
        payment_id: payment.id,
        message: "O Pix expirou. Gere uma nova cobrança.",
      });
    }

    if (!payment.txid) {
      return json(request, {
        success: false,
        status: "pending",
        payment_id: payment.id,
        message: "A cobrança ainda está sendo preparada.",
      });
    }

    const response = await fetch(
      `${BRIDGE_BASE_URL}/get.php?txid=${encodeURIComponent(payment.txid)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${BANCO_INTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(20000),
      },
    );

    const responseText = await response.text();
    let providerPayload: Record<string, unknown> = {};

    try {
      providerPayload = objectValue(JSON.parse(responseText));
    } catch {
      providerPayload = {
        raw: responseText.slice(0, 2000),
        httpStatus: response.status,
      };
    }

    if (!response.ok) {
      await admin.rpc("mark_monitoria_pix_checked", {
        p_payment_id: payment.id,
        p_bank_status: `HTTP_${response.status}`,
        p_provider_payload: providerPayload,
      });

      return json(request, {
        success: false,
        status: "pending",
        payment_id: payment.id,
        message: "O banco ainda não pôde confirmar o pagamento.",
      });
    }

    const data = bankResponseData(providerPayload);
    const bankStatus = normalizeBankStatus(
      data.status ?? data.situacao ?? data.state,
    );

    if (PAID_BANK_STATUSES.has(bankStatus)) {
      const paidAmountCents = bankAmountToCents(data);
      const { data: confirmation, error: confirmationError } =
        await admin.rpc("apply_confirmed_monitoria_payment", {
          p_payment_id: payment.id,
          p_txid: payment.txid,
          p_paid_amount_cents: paidAmountCents,
          p_provider_status: bankStatus,
          p_provider_payload: providerPayload,
          p_confirmed_at: new Date().toISOString(),
        });

      if (confirmationError) {
        console.error(
          "apply_confirmed_monitoria_payment:",
          confirmationError.message,
        );
        return json(
          request,
          { success: false, error: "payment_confirmation_failed" },
          500,
        );
      }

      const result = objectValue(confirmation);

      if (result.success === true) {
        const activatedCameras = Array.isArray(result.activatedCameras)
          ? result.activatedCameras
          : [];
        const assistantPacks = Array.isArray(result.assistantPacks)
          ? result.assistantPacks
          : [];

        return json(request, {
          success: true,
          status: "paid",
          payment_id: payment.id,
          invoice_id: payment.invoice_id,
          invoice_number: result.invoiceNumber ?? invoice?.invoice_number,
          period_start: result.periodStart ?? null,
          period_end: result.periodEnd ?? null,
          activated_cameras: activatedCameras,
          assistant_packs: assistantPacks,
          assistant_interactions: result.assistantInteractions ?? null,
          balance: result.balance ?? null,
          duplicate: result.duplicate === true,
          message:
            assistantPacks.length && !activatedCameras.length
              ? "Pagamento confirmado e interações extras liberadas."
              : "Pagamento confirmado e serviços ativados.",
        });
      }

      return json(request, {
        success: false,
        status: String(result.status ?? "manual_review"),
        payment_id: payment.id,
        reason: result.reason ?? "manual_review",
        message:
          result.reason === "amount_mismatch"
            ? "O valor recebido é diferente da fatura e precisa de revisão."
            : "O pagamento precisa de revisão antes da ativação.",
      });
    }

    await admin.rpc("mark_monitoria_pix_checked", {
      p_payment_id: payment.id,
      p_bank_status: bankStatus || "PENDENTE",
      p_provider_payload: providerPayload,
    });

    return json(request, {
      success: false,
      status: "pending",
      bank_status: bankStatus || "PENDENTE",
      payment_id: payment.id,
      message: "Pagamento ainda não confirmado.",
    });
  } catch (error) {
    console.error(
      "monitoria-check-pix:",
      error instanceof Error ? error.message : String(error),
    );

    return json(
      request,
      {
        success: false,
        status: "error",
        error: "unexpected_error",
        message: "Não foi possível consultar o pagamento.",
      },
      500,
    );
  }
});

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

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function decodeJwtPayload(
  token: string,
): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const normalized = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = normalized.padEnd(
      Math.ceil(normalized.length / 4) * 4,
      "=",
    );
    const payload = JSON.parse(atob(padded));

    return payload &&
        typeof payload === "object" &&
        !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function serviceAuthorized(request: Request) {
  const authorization =
    request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return false;
  }

  // Compatibilidade quando as duas cópias da chave são iguais.
  if (SERVICE_ROLE_KEY && token === SERVICE_ROLE_KEY) {
    return true;
  }

  // O gateway Supabase com verify_jwt=true já verificou a
  // assinatura. Aqui confirmamos o papel e a expiração para
  // aceitar rotações legítimas da chave service_role.
  const payload = decodeJwtPayload(token);

  if (String(payload?.role ?? "") !== "service_role") {
    return false;
  }

  const expiresAt = Number(payload?.exp ?? 0);

  return (
    !Number.isFinite(expiresAt) ||
    expiresAt <= 0 ||
    expiresAt > Math.floor(Date.now() / 1000)
  );
}

function objectValue(value: unknown) {
  return value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function checkPayment(payment: {
  id: string;
  txid: string;
  amount_cents: number;
}) {
  try {
    const response = await fetch(
      `${BRIDGE_BASE_URL}/get.php?txid=${
        encodeURIComponent(payment.txid)
      }`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${BANCO_INTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(18000),
      },
    );

    const responseText = await response.text();
    let providerPayload: Record<string, unknown> = {};

    try {
      providerPayload = objectValue(
        JSON.parse(responseText),
      );
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

      return {
        paymentId: payment.id,
        result: "provider_error",
      };
    }

    const data = bankResponseData(providerPayload);
    const bankStatus = normalizeBankStatus(
      data.status ?? data.situacao ?? data.state,
    );

    if (!PAID_BANK_STATUSES.has(bankStatus)) {
      await admin.rpc("mark_monitoria_pix_checked", {
        p_payment_id: payment.id,
        p_bank_status: bankStatus || "PENDENTE",
        p_provider_payload: providerPayload,
      });

      return {
        paymentId: payment.id,
        result: "pending",
        bankStatus,
      };
    }

    const paidAmountCents = bankAmountToCents(data);

    const { data: confirmation, error } = await admin.rpc(
      "apply_confirmed_monitoria_payment",
      {
        p_payment_id: payment.id,
        p_txid: payment.txid,
        p_paid_amount_cents: paidAmountCents,
        p_provider_status: bankStatus,
        p_provider_payload: providerPayload,
        p_confirmed_at: new Date().toISOString(),
      },
    );

    if (error) {
      console.error(
        `Falha ao confirmar ${payment.id}:`,
        error.message,
      );
      return {
        paymentId: payment.id,
        result: "confirmation_error",
      };
    }

    const result = objectValue(confirmation);

    return {
      paymentId: payment.id,
      result:
        result.success === true
          ? "confirmed"
          : "manual_review",
      duplicate: result.duplicate === true,
      assistantPacks: result.assistantPacks ?? [],
    };
  } catch (error) {
    console.error(
      `Falha ao consultar ${payment.id}:`,
      error instanceof Error
        ? error.message
        : String(error),
    );

    return {
      paymentId: payment.id,
      result: "unexpected_error",
    };
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json(
      { success: false, error: "method_not_allowed" },
      405,
    );
  }

  if (!serviceAuthorized(request)) {
    return json(
      { success: false, error: "unauthorized" },
      401,
    );
  }

  if (!BANCO_INTER_API_KEY) {
    return json(
      {
        success: false,
        error: "banco_inter_not_configured",
      },
      503,
    );
  }

  try {
    const {
      data: deadlines,
      error: deadlinesError,
    } = await admin.rpc(
      "process_monitoria_billing_deadlines",
    );

    if (deadlinesError) {
      console.error(
        "process_monitoria_billing_deadlines:",
        deadlinesError.message,
      );

      return json(
        {
          success: false,
          error: "billing_deadlines_failed",
        },
        500,
      );
    }

    const {
      data: payments,
      error: paymentsError,
    } = await admin
      .from("billing_pix_payments")
      .select("id,txid,amount_cents")
      .in("status", ["pending", "manual_review"])
      .not("txid", "is", null)
      .gt("expires_at", new Date().toISOString())
      .order("last_checked_at", {
        ascending: true,
        nullsFirst: true,
      })
      .limit(25);

    if (paymentsError) {
      console.error(
        "pending payments:",
        paymentsError.message,
      );

      return json(
        {
          success: false,
          error: "pending_payments_unavailable",
        },
        500,
      );
    }

    const results: Array<Record<string, unknown>> = [];

    for (const payment of payments ?? []) {
      results.push(
        await checkPayment({
          id: String(payment.id),
          txid: String(payment.txid),
          amount_cents: Number(payment.amount_cents),
        }),
      );
    }

    return json({
      success: true,
      deadlines: objectValue(deadlines),
      scannedPayments: results.length,
      confirmedPayments: results.filter(
        (item) => item.result === "confirmed",
      ).length,
      manualReview: results.filter(
        (item) => item.result === "manual_review",
      ).length,
      results,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "monitoria-process-billing:",
      error instanceof Error
        ? error.message
        : String(error),
    );

    return json(
      {
        success: false,
        error: "unexpected_error",
      },
      500,
    );
  }
});
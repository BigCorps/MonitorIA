"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { formatBrl } from "@/src/billing/pricing";
import {
  normalizeQrCodeSource,
  paymentCanGenerate,
  paymentNeedsPolling,
  pixStatusLabel,
} from "@/src/billing/pix";
import type { PixPaymentSummary } from "@/src/billing/payment-types";
import { createClient } from "@/src/lib/supabase/client";
import styles from "./billing.module.css";

type Props = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceStatus: string;
  totalCents: number;
  initialPayment: PixPaymentSummary | null;
  canManage: boolean;
};

type EdgePayment = {
  payment_id?: string;
  status?: string;
  txid?: string | null;
  pix_code?: string | null;
  pix_qrcode?: string | null;
  expires_at?: string | null;
  amount_cents?: number;
  bank_status?: string | null;
  paid_at?: string | null;
  period_end?: string | null;
  message?: string;
  error?: string;
};

function fromEdge(
  value: EdgePayment,
  fallback: PixPaymentSummary | null,
): PixPaymentSummary | null {
  const id = value.payment_id ?? fallback?.id;
  if (!id) return fallback;

  return {
    id,
    invoiceId: fallback?.invoiceId ?? "",
    status: value.status ?? fallback?.status ?? "pending",
    txid: value.txid ?? fallback?.txid ?? null,
    amountCents:
      Number(value.amount_cents) || fallback?.amountCents || 0,
    pixCopyPaste:
      value.pix_code ?? fallback?.pixCopyPaste ?? null,
    qrCodePayload:
      value.pix_qrcode ?? fallback?.qrCodePayload ?? null,
    bankStatus:
      value.bank_status ?? fallback?.bankStatus ?? null,
    expiresAt:
      value.expires_at ?? fallback?.expiresAt ?? null,
    confirmedAt:
      value.paid_at ?? fallback?.confirmedAt ?? null,
    lastCheckedAt: new Date().toISOString(),
    checkAttempts: (fallback?.checkAttempts ?? 0) + 1,
    errorCode: value.error ?? null,
    errorMessage: value.message ?? null,
  };
}

function formatDateTime(value: string | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function PixPaymentPanel({
  invoiceId,
  invoiceNumber,
  invoiceStatus: initialInvoiceStatus,
  totalCents,
  initialPayment,
  canManage,
}: Props) {
  const router = useRouter();
  const [payment, setPayment] = useState(initialPayment);
  const [invoiceStatus, setInvoiceStatus] = useState(
    initialInvoiceStatus,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checking = useRef(false);

  const qrSource = useMemo(
    () => normalizeQrCodeSource(payment?.qrCodePayload),
    [payment?.qrCodePayload],
  );

  const invoke = useCallback(
    async (functionName: string, body: Record<string, unknown>) => {
      const supabase = createClient();
      const { data, error: invokeError } =
        await supabase.functions.invoke(functionName, { body });

      if (invokeError) {
        const contextual = invokeError as {
          context?: { json?: () => Promise<unknown> };
        };
        let detail: Record<string, unknown> = {};

        try {
          const parsed = await contextual.context?.json?.();
          if (
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed)
          ) {
            detail = parsed as Record<string, unknown>;
          }
        } catch {
          // A mensagem padrão abaixo permanece.
        }

        throw new Error(
          String(
            detail.message ??
              detail.error ??
              invokeError.message ??
              "Falha ao acessar a cobrança.",
          ),
        );
      }

      return (data ?? {}) as EdgePayment;
    },
    [],
  );

  const generatePix = useCallback(async () => {
    if (busy || !canManage) return;

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const result = await invoke("monitoria-create-pix", {
        invoice_id: invoiceId,
      });

      setPayment((current) => fromEdge(result, current));
      setInvoiceStatus("pending_payment");
      setMessage(
        result.message ??
          "Pix gerado. A confirmação acontecerá automaticamente.",
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível gerar o Pix.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, canManage, invoiceId, invoke, router]);

  const checkPayment = useCallback(
    async (silent = false) => {
      if (!payment?.id || checking.current) return;

      checking.current = true;
      if (!silent) {
        setBusy(true);
        setMessage(null);
        setError(null);
      }

      try {
        const result = await invoke("monitoria-check-pix", {
          payment_id: payment.id,
        });

        setPayment((current) => fromEdge(result, current));

        if (result.status === "paid") {
          setInvoiceStatus("paid");
          setMessage(
            result.message ??
              "Pagamento confirmado. As câmeras foram ativadas.",
          );
          router.refresh();
        } else if (!silent && result.message) {
          setMessage(result.message);
        }
      } catch (caught) {
        if (!silent) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Não foi possível verificar o Pix.",
          );
        }
      } finally {
        checking.current = false;
        if (!silent) setBusy(false);
      }
    },
    [invoke, payment?.id, router],
  );

  useEffect(() => {
    if (!payment || !paymentNeedsPolling(payment.status)) return;

    const interval = window.setInterval(() => {
      void checkPayment(true);
    }, 6000);

    return () => window.clearInterval(interval);
  }, [checkPayment, payment]);

  async function copyPix() {
    if (!payment?.pixCopyPaste) return;

    try {
      await navigator.clipboard.writeText(payment.pixCopyPaste);
      setMessage("Código Pix copiado.");
      setError(null);
    } catch {
      setError("Não foi possível copiar automaticamente.");
    }
  }

  const canGenerate = paymentCanGenerate(
    invoiceStatus,
    payment?.status,
  );
  const paid =
    invoiceStatus === "paid" || payment?.status === "confirmed";

  return (
    <section className={styles.pixCard}>
      <div className={styles.pixHeading}>
        <div>
          <span>PAGAMENTO PIX BIGCORPS</span>
          <h2>{invoiceNumber}</h2>
        </div>
        <strong>{formatBrl(totalCents)}</strong>
      </div>

      <div
        className={`${styles.statusBanner} ${
          paid ? styles.statusPaid : ""
        }`}
      >
        <div>
          <span>Status</span>
          <strong>
            {pixStatusLabel(
              paid ? "paid" : payment?.status ?? invoiceStatus,
            )}
          </strong>
        </div>
        {payment?.bankStatus ? (
          <small>Banco: {payment.bankStatus}</small>
        ) : null}
      </div>

      {message ? (
        <div className={styles.successNotice}>{message}</div>
      ) : null}
      {error ? (
        <div className={styles.errorNotice}>{error}</div>
      ) : null}

      {paid ? (
        <div className={styles.paidState}>
          <div aria-hidden="true">✓</div>
          <h3>Pagamento confirmado</h3>
          <p>
            Os planos das câmeras e as 90 interações mensais
            foram ativados automaticamente.
          </p>
          {payment?.confirmedAt ? (
            <small>
              Confirmado em {formatDateTime(payment.confirmedAt)}
            </small>
          ) : null}
        </div>
      ) : payment?.pixCopyPaste ? (
        <div className={styles.pixContent}>
          <div className={styles.qrArea}>
            {qrSource ? (
              <img
                src={qrSource}
                alt={`QR Code Pix da fatura ${invoiceNumber}`}
              />
            ) : (
              <div className={styles.qrPlaceholder}>PIX</div>
            )}
            <small>
              Expira em {formatDateTime(payment.expiresAt) ?? "30 minutos"}
            </small>
          </div>

          <div className={styles.copyArea}>
            <label>
              <span>Pix copia e cola</span>
              <textarea
                value={payment.pixCopyPaste}
                readOnly
                rows={5}
              />
            </label>
            <button type="button" onClick={copyPix}>
              Copiar código Pix
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void checkPayment(false)}
              disabled={busy}
            >
              {busy ? "Verificando..." : "Já paguei, verificar agora"}
            </button>
            <small>
              O sistema também consulta o banco automaticamente.
            </small>
          </div>
        </div>
      ) : canGenerate ? (
        <div className={styles.generateState}>
          <h3>Gere a cobrança para iniciar o ciclo</h3>
          <p>
            O valor foi calculado no servidor com os planos e o
            desconto progressivo registrados nesta fatura.
          </p>
          <button
            type="button"
            onClick={() => void generatePix()}
            disabled={!canManage || busy}
          >
            {busy ? "Gerando Pix..." : "Gerar QR Code Pix"}
          </button>
          {!canManage ? (
            <small>
              Somente proprietários e administradores podem gerar
              cobranças.
            </small>
          ) : null}
        </div>
      ) : (
        <div className={styles.generateState}>
          <h3>Esta cobrança precisa de atenção</h3>
          <p>
            {payment?.errorMessage ??
              "Atualize a página ou gere uma nova fatura nos planos."}
          </p>
        </div>
      )}
    </section>
  );
}

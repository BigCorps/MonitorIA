"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import styles from "./vip-closing.module.css";

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
  message?: string;
  error?: string;
};

function fromEdge(
  value: EdgePayment,
  fallback: PixPaymentSummary | null,
  invoiceId: string,
): PixPaymentSummary | null {
  const id = value.payment_id ?? fallback?.id;
  if (!id) return fallback;

  return {
    id,
    invoiceId: fallback?.invoiceId ?? invoiceId,
    status: value.status ?? fallback?.status ?? "pending",
    txid: value.txid ?? fallback?.txid ?? null,
    amountCents: Number(value.amount_cents) || fallback?.amountCents || 0,
    pixCopyPaste: value.pix_code ?? fallback?.pixCopyPaste ?? null,
    qrCodePayload: value.pix_qrcode ?? fallback?.qrCodePayload ?? null,
    bankStatus: value.bank_status ?? fallback?.bankStatus ?? null,
    expiresAt: value.expires_at ?? fallback?.expiresAt ?? null,
    confirmedAt: value.paid_at ?? fallback?.confirmedAt ?? null,
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

export function VipPaymentPanel({
  invoiceId,
  invoiceNumber,
  invoiceStatus: initialInvoiceStatus,
  totalCents,
  initialPayment,
  canManage,
}: Props) {
  const router = useRouter();
  const [payment, setPayment] = useState(initialPayment);
  const [invoiceStatus, setInvoiceStatus] = useState(initialInvoiceStatus);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checking = useRef(false);

  const qrSource = useMemo(() => {
    const providerSource = normalizeQrCodeSource(payment?.qrCodePayload);
    if (providerSource) return providerSource;
    if (!payment?.id || !payment.pixCopyPaste) return null;
    return `/api/billing/pix/${encodeURIComponent(payment.id)}/qr`;
  }, [payment?.id, payment?.pixCopyPaste, payment?.qrCodePayload]);

  const invoke = useCallback(
    async (functionName: string, body: Record<string, unknown>) => {
      const supabase = createClient();
      const { data, error: invokeError } = await supabase.functions.invoke(
        functionName,
        { body },
      );

      if (invokeError) {
        const contextual = invokeError as {
          context?: { json?: () => Promise<unknown> };
        };
        let detail: Record<string, unknown> = {};
        try {
          const parsed = await contextual.context?.json?.();
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            detail = parsed as Record<string, unknown>;
          }
        } catch {
          // Mantém a mensagem segura abaixo.
        }

        throw new Error(
          String(
            detail.message ??
              detail.error ??
              invokeError.message ??
              "Falha ao acessar a cobrança VIP.",
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
    setMessage(null);
    setError(null);

    try {
      const result = await invoke("monitoria-create-pix", {
        invoice_id: invoiceId,
      });

      setPayment((current) => fromEdge(result, current, invoiceId));
      setInvoiceStatus("pending_payment");
      setMessage("Pix gerado. A confirmação será consultada automaticamente.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível gerar o Pix VIP.",
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

        setPayment((current) => fromEdge(result, current, invoiceId));

        if (result.status === "paid") {
          setInvoiceStatus("paid");
          setMessage(
            "Pagamento confirmado. Seu ambiente VIP está sendo preparado para ativação.",
          );
          window.setTimeout(() => router.refresh(), 600);
        } else if (!silent && result.message) {
          setMessage(result.message);
        }
      } catch (caught) {
        if (!silent) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Não foi possível verificar o Pix agora.",
          );
        }
      } finally {
        checking.current = false;
        if (!silent) setBusy(false);
      }
    },
    [invoiceId, invoke, payment?.id, router],
  );

  useEffect(() => {
    if (!payment || !paymentNeedsPolling(payment.status)) return;
    const timer = window.setInterval(() => void checkPayment(true), 6000);
    return () => window.clearInterval(timer);
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

  const paid =
    invoiceStatus === "paid" ||
    payment?.status === "confirmed" ||
    payment?.status === "paid";
  const canGenerate = paymentCanGenerate(
    invoiceStatus,
    payment?.status,
  );

  return (
    <section className={styles.paymentCard}>
      <div className={styles.paymentHeading}>
        <div>
          <span>PAGAMENTO · MONITORIA VIP</span>
          <h2>{invoiceNumber}</h2>
        </div>
        <strong>{formatBrl(totalCents)}</strong>
      </div>

      <div className={styles.paymentStatus} data-paid={paid}>
        <div>
          <span>Status</span>
          <strong>
            {pixStatusLabel(paid ? "paid" : payment?.status ?? invoiceStatus)}
          </strong>
        </div>
        {payment?.bankStatus ? <small>Banco: {payment.bankStatus}</small> : null}
      </div>

      {message ? <div className={styles.successNotice}>{message}</div> : null}
      {error ? <div className={styles.errorNotice}>{error}</div> : null}

      {paid ? (
        <div className={styles.paidState}>
          <div>✓</div>
          <h3>Pagamento confirmado</h3>
          <p>
            Seu contrato VIP foi pago. A implantação agora segue para a ativação
            do ambiente definitivo, preservando o projeto e as configurações do piloto.
          </p>
          {payment?.confirmedAt ? (
            <small>Confirmado em {formatDateTime(payment.confirmedAt)}</small>
          ) : null}
        </div>
      ) : payment?.pixCopyPaste ? (
        <div className={styles.pixGrid}>
          <div className={styles.qrBox}>
            {qrSource ? (
              <img src={qrSource} alt={`QR Code Pix ${invoiceNumber}`} />
            ) : (
              <div>PIX</div>
            )}
            <small>
              Expira em {formatDateTime(payment.expiresAt) ?? "30 minutos"}
            </small>
          </div>

          <div className={styles.pixCopy}>
            <label>
              <span>Pix copia e cola</span>
              <textarea value={payment.pixCopyPaste} readOnly rows={5} />
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
            <small>A confirmação também é consultada automaticamente.</small>
          </div>
        </div>
      ) : canGenerate ? (
        <div className={styles.generatePayment}>
          <h3>Gerar cobrança Pix</h3>
          <p>
            O valor vem do snapshot da proposta aceita. Nenhum preço é calculado
            pelo navegador.
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
              Somente proprietários e administradores podem gerar a cobrança.
            </small>
          ) : null}
        </div>
      ) : (
        <div className={styles.generatePayment}>
          <h3>Esta cobrança precisa de atenção</h3>
          <p>
            {payment?.errorMessage ??
              "Atualize a página ou fale com seu especialista MonitorIA VIP."}
          </p>
        </div>
      )}
    </section>
  );
}

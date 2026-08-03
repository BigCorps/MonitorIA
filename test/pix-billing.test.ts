import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeQrCodeSource,
  paymentCanGenerate,
  paymentNeedsPolling,
  pixStatusLabel,
} from "../src/billing/pix.js";
import {
  bankAmountToCents,
  bankResponseData,
  normalizeBankStatus,
} from "../supabase/functions/_shared/pix.js";

test("normaliza QR Code em base64 para data URL", () => {
  assert.equal(
    normalizeQrCodeSource("ABC123"),
    "data:image/png;base64,ABC123",
  );
  assert.equal(
    normalizeQrCodeSource("data:image/png;base64,ABC123"),
    "data:image/png;base64,ABC123",
  );
});

test("somente cobranças pendentes fazem polling", () => {
  assert.equal(paymentNeedsPolling("pending"), true);
  assert.equal(paymentNeedsPolling("confirmed"), false);
  assert.equal(paymentNeedsPolling("manual_review"), false);
});

test("permite gerar novo Pix somente quando necessário", () => {
  assert.equal(paymentCanGenerate("draft", null), true);
  assert.equal(paymentCanGenerate("open", "expired"), true);
  assert.equal(paymentCanGenerate("paid", null), false);
  assert.equal(paymentCanGenerate("pending_payment", "pending"), false);
});

test("interpreta status e valores retornados pelo Banco Inter", () => {
  const data = bankResponseData({
    data: { status: "concluida", valor: "79,90" },
  });

  assert.equal(normalizeBankStatus(data.status), "CONCLUIDA");
  assert.equal(bankAmountToCents(data), 7990);
  assert.equal(bankAmountToCents({ valor: { original: "149.90" } }), 14990);
});

test("traduz estados financeiros para o dashboard", () => {
  assert.equal(pixStatusLabel("pending_payment"), "Aguardando pagamento");
  assert.equal(pixStatusLabel("confirmed"), "Pago");
});

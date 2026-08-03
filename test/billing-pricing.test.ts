import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateVolumePricing,
  nextDiscountMessage,
} from "../src/billing/pricing.js";
import type {
  CommercialPlan,
  VolumeDiscountTier,
} from "../src/billing/types.js";

const plans: CommercialPlan[] = [
  {
    code: "basic",
    displayName: "Essencial",
    shortDescription: "",
    amountCents: 3990,
    currency: "BRL",
    billingPeriodDays: 30,
    metadataRetentionDays: 365,
    longTermKeyframes: 1,
    temporaryFrameDays: 1,
    clipEnabled: false,
    clipDurationSeconds: null,
    clipRetentionDays: null,
    maximumAnalysisFrames: 1,
    maximumEscalationPercent: 0,
    features: {},
    sortOrder: 10,
  },
  {
    code: "standard",
    displayName: "Atenta",
    shortDescription: "",
    amountCents: 7990,
    currency: "BRL",
    billingPeriodDays: 30,
    metadataRetentionDays: 365,
    longTermKeyframes: 2,
    temporaryFrameDays: 3,
    clipEnabled: false,
    clipDurationSeconds: null,
    clipRetentionDays: null,
    maximumAnalysisFrames: 3,
    maximumEscalationPercent: 15,
    features: {},
    sortOrder: 20,
  },
  {
    code: "intensive",
    displayName: "Detalhada",
    shortDescription: "",
    amountCents: 14990,
    currency: "BRL",
    billingPeriodDays: 30,
    metadataRetentionDays: 365,
    longTermKeyframes: 3,
    temporaryFrameDays: 7,
    clipEnabled: true,
    clipDurationSeconds: 15,
    clipRetentionDays: 30,
    maximumAnalysisFrames: 4,
    maximumEscalationPercent: 30,
    features: {},
    sortOrder: 30,
  },
];

const tiers: VolumeDiscountTier[] = [
  {
    minimumPosition: 1,
    maximumPosition: 2,
    discountBasisPoints: 0,
    label: "1–2",
  },
  {
    minimumPosition: 3,
    maximumPosition: 4,
    discountBasisPoints: 500,
    label: "3–4",
  },
  {
    minimumPosition: 5,
    maximumPosition: 8,
    discountBasisPoints: 1000,
    label: "5–8",
  },
  {
    minimumPosition: 9,
    maximumPosition: 16,
    discountBasisPoints: 1500,
    label: "9–16",
  },
  {
    minimumPosition: 17,
    maximumPosition: null,
    discountBasisPoints: 2000,
    label: "17+",
  },
];

test("ordena planos mistos do maior para o menor antes de aplicar desconto", () => {
  const result = calculateVolumePricing({
    plans,
    tiers,
    selections: [
      {
        cameraId: "c-basic-2",
        cameraName: "Corredor",
        planCode: "basic",
      },
      {
        cameraId: "c-intensive",
        cameraName: "Caixa",
        planCode: "intensive",
      },
      {
        cameraId: "c-standard",
        cameraName: "Entrada",
        planCode: "standard",
      },
      {
        cameraId: "c-basic-1",
        cameraName: "Estoque",
        planCode: "basic",
      },
    ],
  });

  assert.deepEqual(
    result.items.map((item) => item.planCode),
    ["intensive", "standard", "basic", "basic"],
  );
  assert.equal(result.subtotalCents, 30960);
  assert.equal(result.discountCents, 400);
  assert.equal(result.totalCents, 30560);
});

test("dezesseis câmeras essenciais preservam margem com desconto marginal", () => {
  const result = calculateVolumePricing({
    plans,
    tiers,
    selections: Array.from({ length: 16 }, (_, index) => ({
      cameraId: `camera-${String(index + 1).padStart(2, "0")}`,
      cameraName: `Câmera ${index + 1}`,
      planCode: "basic" as const,
    })),
  });

  assert.equal(result.subtotalCents, 63840);
  assert.equal(result.discountCents, 6788);
  assert.equal(result.totalCents, 57052);
  assert.equal(result.items[8]?.discountBasisPoints, 1500);
});

test("a próxima câmera informa sua faixa correta", () => {
  assert.match(
    nextDiscountMessage(4, tiers),
    /10% de desconto/,
  );
});

test("recusa câmera duplicada", () => {
  assert.throws(
    () =>
      calculateVolumePricing({
        plans,
        tiers,
        selections: [
          {
            cameraId: "same",
            cameraName: "Uma",
            planCode: "basic",
          },
          {
            cameraId: "same",
            cameraName: "Duas",
            planCode: "standard",
          },
        ],
      }),
    /Câmera repetida/,
  );
});

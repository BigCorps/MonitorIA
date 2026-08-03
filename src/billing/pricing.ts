import type {
  CameraPlanSelection,
  CommercialPlan,
  CommercialPlanCode,
  VolumeDiscountTier,
  VolumePricingResult,
} from "./types";

export function formatBrl(amountCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amountCents / 100);
}

function discountForPosition(
  position: number,
  tiers: VolumeDiscountTier[],
) {
  return (
    [...tiers]
      .sort(
        (left, right) =>
          right.minimumPosition - left.minimumPosition,
      )
      .find(
        (tier) =>
          position >= tier.minimumPosition &&
          (tier.maximumPosition === null ||
            position <= tier.maximumPosition),
      )?.discountBasisPoints ?? 0
  );
}

function roundPositive(value: number) {
  return Math.floor(value + 0.5);
}

export function calculateVolumePricing(input: {
  selections: CameraPlanSelection[];
  plans: CommercialPlan[];
  tiers: VolumeDiscountTier[];
}): VolumePricingResult {
  const planByCode = new Map<CommercialPlanCode, CommercialPlan>(
    input.plans.map((plan) => [plan.code, plan]),
  );

  const seen = new Set<string>();
  const prepared = input.selections.map((selection) => {
    if (seen.has(selection.cameraId)) {
      throw new Error(
        `Câmera repetida no cálculo: ${selection.cameraId}`,
      );
    }

    seen.add(selection.cameraId);

    const plan = planByCode.get(selection.planCode);
    if (!plan) {
      throw new Error(
        `Plano comercial desconhecido: ${selection.planCode}`,
      );
    }

    return { selection, plan };
  });

  prepared.sort((left, right) => {
    const priceDifference =
      right.plan.amountCents - left.plan.amountCents;

    if (priceDifference !== 0) return priceDifference;
    return left.selection.cameraId.localeCompare(
      right.selection.cameraId,
    );
  });

  const items = prepared.map(({ selection, plan }, index) => {
    const billingPosition = index + 1;
    const discountBasisPoints = discountForPosition(
      billingPosition,
      input.tiers,
    );
    const discountAmountCents = roundPositive(
      (plan.amountCents * discountBasisPoints) / 10_000,
    );

    return {
      cameraId: selection.cameraId,
      cameraName: selection.cameraName,
      planCode: plan.code,
      planName: plan.displayName,
      billingPosition,
      baseAmountCents: plan.amountCents,
      discountBasisPoints,
      discountAmountCents,
      totalAmountCents:
        plan.amountCents - discountAmountCents,
    };
  });

  return {
    calculationVersion: "volume-marginal-v1",
    currency: "BRL",
    cameraCount: items.length,
    subtotalCents: items.reduce(
      (total, item) => total + item.baseAmountCents,
      0,
    ),
    discountCents: items.reduce(
      (total, item) =>
        total + item.discountAmountCents,
      0,
    ),
    totalCents: items.reduce(
      (total, item) => total + item.totalAmountCents,
      0,
    ),
    items,
  };
}

export function nextDiscountMessage(
  cameraCount: number,
  tiers: VolumeDiscountTier[],
) {
  const nextPosition = cameraCount + 1;
  const discountBasisPoints = discountForPosition(
    nextPosition,
    tiers,
  );

  if (discountBasisPoints <= 0) {
    return "As câmeras adicionais passam a receber desconto progressivo.";
  }

  return `A próxima câmera terá ${(
    discountBasisPoints / 100
  ).toLocaleString("pt-BR")}% de desconto.`;
}

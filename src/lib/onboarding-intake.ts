export const BUSINESS_OPTIONS = [
  { value: "Mercado / mercearia", label: "Mercado / mercearia" },
  { value: "Loja / varejo", label: "Loja / varejo" },
  { value: "Restaurante / bar", label: "Restaurante / bar" },
  { value: "Farmácia", label: "Farmácia" },
  { value: "Pet shop", label: "Pet shop" },
  { value: "Oficina / auto center", label: "Oficina / auto center" },
  { value: "Condomínio", label: "Condomínio" },
  { value: "Outro", label: "Outro" },
] as const;

export const DEFAULT_CAMERA_COUNT = 4;

function recordValue(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function cleanText(
  value: unknown,
  maxLength: number,
) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

export function normalizeCameraCount(
  value: unknown,
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_CAMERA_COUNT;
  }

  return Math.min(
    64,
    Math.max(1, Math.round(parsed)),
  );
}

export function normalizeIndustry(
  value: unknown,
) {
  const text = cleanText(value, 120);

  return BUSINESS_OPTIONS.some(
    (option) => option.value === text,
  )
    ? text
    : "Outro";
}

export type OnboardingIntake = {
  organizationName: string;
  siteName: string;
  industry: string;
  cameraCount: number;
};

export function onboardingIntakeFromFormData(
  formData: FormData,
): OnboardingIntake {
  return {
    organizationName: cleanText(
      formData.get("organization_name"),
      160,
    ),
    siteName: cleanText(
      formData.get("site_name"),
      160,
    ),
    industry: normalizeIndustry(
      formData.get("industry"),
    ),
    cameraCount: normalizeCameraCount(
      formData.get("camera_count"),
    ),
  };
}

export function hasRequiredOnboardingIntake(
  intake: OnboardingIntake,
) {
  return (
    intake.organizationName.length >= 2 &&
    intake.siteName.length >= 1 &&
    intake.cameraCount >= 1 &&
    intake.cameraCount <= 64
  );
}

export function readOnboardingIntake(
  metadata: unknown,
): OnboardingIntake {
  const data = recordValue(metadata);

  return {
    organizationName: cleanText(
      data.onboarding_organization_name,
      160,
    ),
    siteName: cleanText(
      data.onboarding_site_name,
      160,
    ),
    industry: normalizeIndustry(
      data.onboarding_industry,
    ),
    cameraCount: normalizeCameraCount(
      data.onboarding_camera_count,
    ),
  };
}

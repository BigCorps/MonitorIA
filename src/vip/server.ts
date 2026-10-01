import "server-only";

import { appConfig } from "@/src/lib/app-config";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  createSalesTrialToken,
  hashSalesTrialToken,
} from "@/src/trial/sales-token";
import {
  VIP_MINIMUM_PACKAGE_CAMERAS,
  VIP_TECHNICAL_PLAN_CODE,
  VIP_TRIAL_DURATION_MINUTES,
  VIP_TRIAL_MAX_CAMERAS,
} from "./catalog";
import { vipConfig } from "./config";
import type {
  VipBillingCycle,
  VipPlanCatalogEntry,
  VipPlanCode,
  VipProject,
  VipProjectKind,
  VipProjectStatus,
} from "./types";

const PROJECT_SELECT = [
  "id",
  "organization_id",
  "sales_operator_id",
  "name",
  "company_name",
  "lead_name",
  "lead_email",
  "project_kind",
  "status",
  "selected_plan_code",
  "billing_cycle",
  "expected_camera_count",
  "technical_plan_code",
  "trial_duration_minutes",
  "trial_max_cameras",
  "objective",
  "onboarding_last_activity_at",
  "onboarding_attention_code",
  "onboarding_snapshot",
  "created_at",
  "updated_at",
].join(",");

const PLAN_SELECT = [
  "code",
  "display_name",
  "short_description",
  "included_cameras",
  "monthly_amount_cents",
  "annual_amount_cents",
  "excess_camera_monthly_cents",
  "technical_plan_code",
  "trial_duration_minutes",
  "trial_max_cameras",
  "sort_order",
  "is_active",
].join(",");

function normalizedText(value: string, field: string) {
  const result = value.trim();
  if (!result) throw new Error(`invalid_${field}`);
  return result;
}

function normalizedEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("invalid_lead_email");
  }
  return email;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function planFromRow(row: Record<string, unknown>): VipPlanCatalogEntry {
  return {
    code: String(row.code) as VipPlanCode,
    displayName: String(row.display_name),
    shortDescription: String(row.short_description ?? ""),
    includedCameras: Number(row.included_cameras),
    monthlyAmountCents: Number(row.monthly_amount_cents),
    annualAmountCents: Number(row.annual_amount_cents),
    excessCameraMonthlyCents: Number(row.excess_camera_monthly_cents),
    technicalPlanCode: "intensive",
    trialDurationMinutes: 60,
    trialMaxCameras: 6,
    sortOrder: Number(row.sort_order ?? 0),
    isActive: row.is_active === true,
  };
}

function projectFromRow(row: Record<string, unknown>): VipProject {
  return {
    id: String(row.id),
    organizationId: row.organization_id ? String(row.organization_id) : null,
    salesOperatorId: String(row.sales_operator_id),
    name: String(row.name),
    companyName: String(row.company_name),
    leadName: String(row.lead_name),
    leadEmail: String(row.lead_email),
    projectKind: String(row.project_kind) as VipProjectKind,
    status: String(row.status) as VipProjectStatus,
    selectedPlanCode: String(row.selected_plan_code) as VipPlanCode,
    billingCycle: row.billing_cycle
      ? (String(row.billing_cycle) as VipBillingCycle)
      : null,
    expectedCameraCount: Number(row.expected_camera_count),
    technicalPlanCode: "intensive",
    trialDurationMinutes: 60,
    trialMaxCameras: 6,
    objective: row.objective ? String(row.objective) : null,
    onboardingLastActivityAt: row.onboarding_last_activity_at
      ? String(row.onboarding_last_activity_at)
      : null,
    onboardingAttentionCode: row.onboarding_attention_code
      ? String(row.onboarding_attention_code)
      : null,
    onboardingSnapshot: asObject(row.onboarding_snapshot),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getVipPlanCatalog(): Promise<VipPlanCatalogEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vip_plan_catalog")
    .select(PLAN_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Falha ao carregar catálogo VIP:", error.message);
    throw new Error("vip_plan_catalog_unavailable");
  }

  return (data ?? []).map((row) => planFromRow(asObject(row)));
}

export async function getVipProjectById(
  projectId: string,
): Promise<VipProject | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vip_projects")
    .select(PROJECT_SELECT)
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    console.error("Falha ao carregar Projeto VIP:", error.message);
    throw new Error("vip_project_unavailable");
  }

  return data ? projectFromRow(asObject(data)) : null;
}

export async function getVipProjectForOrganization(
  organizationId: string,
): Promise<VipProject | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vip_projects")
    .select(PROJECT_SELECT)
    .eq("organization_id", organizationId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Falha ao carregar Projeto VIP da organização:", error.message);
    throw new Error("vip_project_unavailable");
  }

  return data ? projectFromRow(asObject(data)) : null;
}

export async function createVipProject(input: {
  salesOperatorId: string;
  actorUserId?: string | null;
  name: string;
  companyName: string;
  leadName: string;
  leadEmail: string;
  projectKind: VipProjectKind;
  selectedPlanCode: VipPlanCode;
  expectedCameraCount: number;
  objective?: string | null;
  billingCycle?: VipBillingCycle | null;
  metadata?: Record<string, unknown>;
}): Promise<VipProject> {
  if (
    !Number.isInteger(input.expectedCameraCount) ||
    input.expectedCameraCount < VIP_MINIMUM_PACKAGE_CAMERAS
  ) {
    throw new Error("vip_expected_camera_count_below_minimum");
  }

  const admin = createAdminClient();

  const [{ data: operator, error: operatorError }, { data: plan, error: planError }] =
    await Promise.all([
      admin
        .from("sales_operators")
        .select("id,active")
        .eq("id", input.salesOperatorId)
        .eq("active", true)
        .maybeSingle(),
      admin
        .from("vip_plan_catalog")
        .select("code,is_active,technical_plan_code,trial_duration_minutes,trial_max_cameras")
        .eq("code", input.selectedPlanCode)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  if (operatorError || !operator) {
    throw new Error("vip_sales_operator_unavailable");
  }
  if (planError || !plan) {
    throw new Error("vip_plan_unavailable");
  }
  if (
    String(plan.technical_plan_code) !== VIP_TECHNICAL_PLAN_CODE ||
    Number(plan.trial_duration_minutes) !== VIP_TRIAL_DURATION_MINUTES ||
    Number(plan.trial_max_cameras) !== VIP_TRIAL_MAX_CAMERAS
  ) {
    throw new Error("vip_plan_contract_invalid");
  }

  const { data, error } = await admin
    .from("vip_projects")
    .insert({
      sales_operator_id: input.salesOperatorId,
      name: normalizedText(input.name, "vip_project_name"),
      company_name: normalizedText(input.companyName, "company_name"),
      lead_name: normalizedText(input.leadName, "lead_name"),
      lead_email: normalizedEmail(input.leadEmail),
      project_kind: input.projectKind,
      status: "lead",
      selected_plan_code: input.selectedPlanCode,
      billing_cycle: input.billingCycle ?? null,
      expected_camera_count: input.expectedCameraCount,
      technical_plan_code: VIP_TECHNICAL_PLAN_CODE,
      trial_duration_minutes: VIP_TRIAL_DURATION_MINUTES,
      trial_max_cameras: VIP_TRIAL_MAX_CAMERAS,
      objective: input.objective?.trim() || null,
      created_by: input.actorUserId ?? null,
      metadata: {
        productFamily: vipConfig.productFamily,
        ...(input.metadata ?? {}),
      },
    })
    .select(PROJECT_SELECT)
    .single();

  if (error || !data) {
    console.error("Falha ao criar Projeto VIP:", error?.message);
    throw new Error("vip_project_creation_failed");
  }

  return projectFromRow(asObject(data));
}

export async function createVipSalesInvite(input: {
  projectId: string;
  actorUserId?: string | null;
  actorSalesOperatorId?: string | null;
  expiresInDays?: number;
}) {
  const expiresInDays = input.expiresInDays ?? 7;
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) {
    throw new Error("invalid_vip_invite_expiry");
  }

  const token = createSalesTrialToken();
  const tokenHash = hashSalesTrialToken(token);
  const expiresAt = new Date(
    Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_vip_sales_invite", {
    p_project_id: input.projectId,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
    p_actor_user_id: input.actorUserId ?? null,
    p_actor_sales_operator_id: input.actorSalesOperatorId ?? null,
  });

  if (error) {
    console.error("Falha ao criar convite VIP:", error.message);
    throw new Error("vip_sales_invite_creation_failed");
  }

  const result = asObject(data);
  if (result.success !== true) {
    throw new Error("vip_sales_invite_creation_failed");
  }

  const path = `/lead/${token}`;
  return {
    projectId: String(result.projectId ?? input.projectId),
    salesInviteId: String(result.salesInviteId),
    token,
    path,
    vipUrl: `${vipConfig.url}${path}`,
    currentAppFallbackUrl: `${appConfig.url}${path}`,
    expiresAt: String(result.expiresAt ?? expiresAt),
    durationMinutes: Number(result.durationMinutes ?? VIP_TRIAL_DURATION_MINUTES),
    maxCameras: Number(result.maxCameras ?? VIP_TRIAL_MAX_CAMERAS),
    technicalPlanCode: String(
      result.technicalPlanCode ?? VIP_TECHNICAL_PLAN_CODE,
    ),
    vipPlanCode: String(result.vipPlanCode) as VipPlanCode,
  };
}

export async function transitionVipProject(input: {
  projectId: string;
  toStatus: VipProjectStatus;
  actorUserId?: string | null;
  actorSalesOperatorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("transition_vip_project", {
    p_project_id: input.projectId,
    p_to_status: input.toStatus,
    p_actor_user_id: input.actorUserId ?? null,
    p_actor_sales_operator_id: input.actorSalesOperatorId ?? null,
    p_metadata: input.metadata ?? {},
  });

  if (error) {
    console.error("Falha ao avançar Projeto VIP:", error.message);
    throw new Error("vip_project_transition_failed");
  }

  const result = asObject(data);
  if (result.success !== true) {
    throw new Error("vip_project_transition_failed");
  }

  return {
    projectId: String(result.projectId ?? input.projectId),
    status: String(result.status) as VipProjectStatus,
    duplicate: result.duplicate === true,
  };
}

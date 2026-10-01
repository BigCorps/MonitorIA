import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  cheapestVipPlanForMonthlyCameraCount,
  quoteVipPlan,
  VIP_MINIMUM_PACKAGE_CAMERAS,
  VIP_TECHNICAL_PLAN_CODE,
  VIP_TRIAL_DURATION_MINUTES,
  VIP_TRIAL_MAX_CAMERAS,
} from "../src/vip/catalog";
import { canTransitionVipProject } from "../src/vip/status";
import type { VipPlanCatalogEntry } from "../src/vip/types";

const plans: VipPlanCatalogEntry[] = [
  {
    code: "vip10",
    displayName: "MonitorIA VIP 10",
    shortDescription: "",
    includedCameras: 10,
    monthlyAmountCents: 129900,
    annualAmountCents: 1299000,
    excessCameraMonthlyCents: 12900,
    technicalPlanCode: "intensive",
    trialDurationMinutes: 60,
    trialMaxCameras: 6,
    sortOrder: 10,
    isActive: true,
  },
  {
    code: "vip50",
    displayName: "MonitorIA VIP 50",
    shortDescription: "",
    includedCameras: 50,
    monthlyAmountCents: 499900,
    annualAmountCents: 4999000,
    excessCameraMonthlyCents: 9900,
    technicalPlanCode: "intensive",
    trialDurationMinutes: 60,
    trialMaxCameras: 6,
    sortOrder: 20,
    isActive: true,
  },
  {
    code: "vip150",
    displayName: "MonitorIA VIP 150",
    shortDescription: "",
    includedCameras: 150,
    monthlyAmountCents: 1199000,
    annualAmountCents: 11990000,
    excessCameraMonthlyCents: 7900,
    technicalPlanCode: "intensive",
    trialDurationMinutes: 60,
    trialMaxCameras: 6,
    sortOrder: 30,
    isActive: true,
  },
];

test("VIP fixa Intensive, pacote mínimo e trial assistido", () => {
  assert.equal(VIP_TECHNICAL_PLAN_CODE, "intensive");
  assert.equal(VIP_MINIMUM_PACKAGE_CAMERAS, 10);
  assert.equal(VIP_TRIAL_DURATION_MINUTES, 60);
  assert.equal(VIP_TRIAL_MAX_CAMERAS, 6);
});

test("VIP 10 cobra o excedente mensal sem alterar a base anual", () => {
  const monthly = quoteVipPlan(plans[0], 12, "monthly");
  assert.equal(monthly.excessCameras, 2);
  assert.equal(monthly.excessMonthlyTotalCents, 25800);
  assert.equal(monthly.monthlyOperatingTotalCents, 155700);
  assert.equal(monthly.baseContractCents, 129900);

  const annual = quoteVipPlan(plans[0], 12, "annual");
  assert.equal(annual.baseContractCents, 1299000);
  assert.equal(annual.excessMonthlyTotalCents, 25800);
});

test("upgrade mensal fica economicamente melhor em 39 e 121 câmeras", () => {
  assert.equal(
    cheapestVipPlanForMonthlyCameraCount(plans, 38)?.code,
    "vip10",
  );
  assert.equal(
    cheapestVipPlanForMonthlyCameraCount(plans, 39)?.code,
    "vip50",
  );
  assert.equal(
    cheapestVipPlanForMonthlyCameraCount(plans, 120)?.code,
    "vip50",
  );
  assert.equal(
    cheapestVipPlanForMonthlyCameraCount(plans, 121)?.code,
    "vip150",
  );
});

test("máquina de estados não permite pular onboarding", () => {
  assert.equal(canTransitionVipProject("lead", "invited"), true);
  assert.equal(canTransitionVipProject("invited", "project_setup"), true);
  assert.equal(canTransitionVipProject("calibrating", "ready_for_trial"), true);
  assert.equal(canTransitionVipProject("payment_pending", "active"), true);
  assert.equal(canTransitionVipProject("lead", "active"), false);
  assert.equal(canTransitionVipProject("trial_running", "proposal"), false);
});

test("migration Gate 1 preserva plano técnico e isola tabelas comerciais", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20261001153532_monitoria_vip_gate1_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /create table public\.vip_plan_catalog/);
  assert.match(migration, /create table public\.vip_projects/);
  assert.match(migration, /create table public\.vip_project_status_events/);
  assert.match(migration, /129900/);
  assert.match(migration, /499900/);
  assert.match(migration, /1199000/);
  assert.match(migration, /technical_plan_code = 'intensive'/);
  assert.match(migration, /trial_duration_minutes = 60/);
  assert.match(migration, /trial_max_cameras = 6/);
  assert.match(migration, /revoke all on table public\.vip_projects from anon, authenticated/);
  assert.match(migration, /add column vip_project_id uuid null/);
});

test("RPC de convite VIP é service-role only e atômica", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20261001153831_monitoria_vip_gate1_atomic_invites.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /create or replace function public\.create_vip_sales_invite/);
  assert.match(migration, /selected_plan_code[\s\S]*'intensive'/);
  assert.match(migration, /'salesInviteId'/);
  assert.match(
    migration,
    /revoke all on function public\.create_vip_sales_invite[\s\S]*from public, anon, authenticated/,
  );
  assert.match(migration, /grant execute[\s\S]*to service_role/);
});

test("contexto de trial expõe vínculo VIP sem alterar sales_assisted", async () => {
  const [invite, context] = await Promise.all([
    readFile(new URL("../src/lib/sales-trial.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../src/lib/sales-trial-context.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(invite, /vip_project_id/);
  assert.match(invite, /vipProjectId/);
  assert.match(context, /vip_project_id/);
  assert.match(context, /vipProjectId/);
  assert.match(context, /"self_service" \| "sales_assisted"/);
});


test("banco também bloqueia salto direto na máquina de estados VIP", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20261001154741_monitoria_vip_gate1_integrity_hardening.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /vip_projects_status_transition_guard/);
  assert.match(migration, /vip_project_transition_not_allowed/);
  assert.match(migration, /private\.vip_project_transition_allowed/);
  assert.match(migration, /vip_project_status_events_to_status_check/);
});

"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`Campo obrigatório ausente: ${key}.`);
  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function numberValue(formData: FormData, key: string, fallback: number) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? value : fallback;
}

async function context() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) throw new Error("Organização não encontrada.");
  if (!new Set(["owner", "admin"]).has(organization.role)) {
    throw new Error("Apenas owner e admin podem revisar perfis operacionais.");
  }
  return { user, organization, supabase: await createClient() };
}

export async function reviewStaffCandidateAction(formData: FormData) {
  const { organization, supabase } = await context();
  const action = requiredString(formData, "action");
  const candidateId = requiredString(formData, "candidate_id");

  const { error } = await supabase.rpc("review_staff_profile_candidate_v1", {
    p_organization_id: organization.id,
    p_candidate_id: candidateId,
    p_action: action,
    p_label: optionalString(formData, "label"),
    p_description: optionalString(formData, "description"),
    p_min_similarity: numberValue(formData, "min_similarity", 0.74),
    p_notes: optionalString(formData, "notes"),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/operational-profiles");
}

export async function reviewStaffMatchAction(formData: FormData) {
  const { organization, supabase } = await context();
  const decisionId = requiredString(formData, "decision_id");
  const verdict = requiredString(formData, "verdict");

  const { error } = await supabase.rpc("review_staff_profile_match_v1", {
    p_organization_id: organization.id,
    p_decision_id: decisionId,
    p_verdict: verdict,
    p_target_profile_id: optionalString(formData, "target_profile_id"),
    p_notes: optionalString(formData, "notes"),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/operational-profiles");
}

export async function reviewStaffProposalAction(formData: FormData) {
  const { organization, supabase } = await context();
  const proposalId = requiredString(formData, "proposal_id");
  const action = requiredString(formData, "action");

  const { error } = await supabase.rpc("review_staff_profile_update_proposal_v1", {
    p_organization_id: organization.id,
    p_proposal_id: proposalId,
    p_action: action,
    p_notes: optionalString(formData, "notes"),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/operational-profiles");
}

export async function saveStaffProfileAction(formData: FormData) {
  const { organization, supabase } = await context();
  const profileId = requiredString(formData, "profile_id");
  const expectedVersion = numberValue(formData, "expected_version", 1);

  const { error } = await supabase.rpc("save_staff_operational_profile_v1", {
    p_organization_id: organization.id,
    p_profile_id: profileId,
    p_expected_version: expectedVersion,
    p_label: requiredString(formData, "label"),
    p_description: optionalString(formData, "description") ?? "",
    p_profile_status: requiredString(formData, "profile_status"),
    p_update_mode: requiredString(formData, "update_mode"),
    p_min_similarity: numberValue(formData, "min_similarity", 0.74),
    p_notes: optionalString(formData, "notes"),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/operational-profiles");
}

import type {
  ShiftWindow,
  StaffOperationalProfile,
  StaffOperationalProfileOverview,
  StaffProfileCandidate,
  StaffProfileMatchDecision,
  StaffProfileUpdateProposal,
} from "@/src/contracts/staff-operational-profile";
import { createClient } from "@/src/lib/supabase/server";

export type StaffOperationalProfileOverviewInput = {
  cameraId?: string | null;
  status?: string | null;
  limit?: number;
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map(Number).filter(Number.isFinite)
    : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function shiftWindows(value: unknown): ShiftWindow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = objectValue(item);
    const weekday = Number(row.weekday);
    const startMinute = Number(row.startMinute ?? row.start_minute);
    const medianMinute = Number(row.medianMinute ?? row.median_minute);
    const endMinute = Number(row.endMinute ?? row.end_minute);
    const observations = Number(row.observations ?? 0);
    if (![weekday, startMinute, medianMinute, endMinute].every(Number.isFinite)) {
      return [];
    }
    return [{ weekday, startMinute, medianMinute, endMinute, observations }];
  });
}

function appearanceSummary(value: unknown): string[] {
  const appearance = objectValue(value);
  const labels: Array<[string, string]> = [
    ["upperClothingColor", "parte superior"],
    ["lowerClothingColor", "parte inferior"],
    ["upperClothingType", "roupa superior"],
    ["lowerClothingType", "roupa inferior"],
    ["hairColor", "cabelo"],
    ["hairLength", "comprimento do cabelo"],
    ["facialHair", "barba"],
    ["eyewear", "óculos"],
    ["bodyBuild", "silhueta"],
    ["headwear", "cobertura de cabeça"],
  ];

  const result = labels.flatMap(([key, label]) => {
    const raw = appearance[key];
    if (typeof raw !== "string" || !raw.trim()) return [];
    if (["unknown", "none", "not_visible"].includes(raw.toLowerCase())) return [];
    return [`${label}: ${raw}`];
  });

  const features = appearance.distinctiveVisibleFeatures;
  if (Array.isArray(features)) {
    result.push(...features.map((item) => String(item)).filter(Boolean));
  }

  return [...new Set(result)].slice(0, 12);
}

function zoneNames(ids: string[], map: Map<string, string>) {
  return ids.map((id) => map.get(id) ?? "Zona configurada");
}

export async function getStaffOperationalProfileOverview(
  organizationId: string,
  input: StaffOperationalProfileOverviewInput = {},
): Promise<StaffOperationalProfileOverview> {
  const supabase = await createClient();
  const limit = Math.max(1, Math.min(input.limit ?? 100, 250));

  let profileQuery = supabase
    .from("camera_staff_profiles")
    .select(`
      id,
      camera_id,
      label,
      description,
      min_similarity,
      profile_status,
      profile_version,
      update_mode,
      habitual_zone_ids,
      habitual_action_codes,
      habitual_session_types,
      habitual_weekdays,
      shift_windows,
      recurring_appearance,
      observation_count,
      distinct_days_count,
      profile_confidence,
      last_observed_at,
      last_reviewed_at,
      locked_fields,
      camera:cameras(name),
      proposals:staff_profile_update_proposals(id,status)
    `)
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true })
    .limit(limit);

  let candidateQuery = supabase
    .from("staff_profile_candidates")
    .select(`
      id,
      camera_id,
      status,
      suggested_label,
      canonical_appearance,
      zone_ids,
      action_codes,
      session_types,
      weekdays,
      shift_windows,
      observation_count,
      distinct_days_count,
      confidence,
      first_seen_at,
      last_seen_at,
      expires_at,
      evidence_event_ids,
      camera:cameras(name)
    `)
    .eq("organization_id", organizationId)
    .in("status", ["learning", "pending_review"])
    .order("status", { ascending: false })
    .order("confidence", { ascending: false })
    .limit(limit);

  let decisionQuery = supabase
    .from("staff_profile_match_decisions")
    .select(`
      id,
      camera_id,
      event_id,
      event_person_id,
      staff_profile_id,
      candidate_id,
      decision,
      review_status,
      appearance_score,
      zone_score,
      action_score,
      schedule_score,
      total_score,
      reasons,
      observed_at,
      camera:cameras(name),
      profile:camera_staff_profiles(label)
    `)
    .eq("organization_id", organizationId)
    .eq("review_status", "pending")
    .order("observed_at", { ascending: false })
    .limit(limit);

  let proposalQuery = supabase
    .from("staff_profile_update_proposals")
    .select(`
      id,
      staff_profile_id,
      camera_id,
      status,
      proposed_zone_ids,
      proposed_action_codes,
      proposed_session_types,
      proposed_weekdays,
      proposed_shift_windows,
      proposed_recurring_appearance,
      observation_count,
      distinct_days_count,
      confidence,
      reason,
      evidence_event_ids,
      created_at,
      valid_until,
      camera:cameras(name),
      profile:camera_staff_profiles(label)
    `)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (input.cameraId) {
    profileQuery = profileQuery.eq("camera_id", input.cameraId);
    candidateQuery = candidateQuery.eq("camera_id", input.cameraId);
    decisionQuery = decisionQuery.eq("camera_id", input.cameraId);
    proposalQuery = proposalQuery.eq("camera_id", input.cameraId);
  }
  if (input.status && input.status !== "all") {
    profileQuery = profileQuery.eq("profile_status", input.status);
  }

  const [profilesResult, candidatesResult, decisionsResult, proposalsResult, zonesResult] =
    await Promise.all([
      profileQuery,
      candidateQuery,
      decisionQuery,
      proposalQuery,
      supabase
        .from("camera_zones")
        .select("id,name")
        .eq("organization_id", organizationId),
    ]);

  for (const result of [profilesResult, candidatesResult, decisionsResult, proposalsResult, zonesResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const zoneMap = new Map(
    (zonesResult.data ?? []).map((row: any) => [String(row.id), String(row.name)]),
  );

  const profiles: StaffOperationalProfile[] = (profilesResult.data ?? []).map((row: any) => {
    const camera = relationOne<{ name?: string }>(row.camera);
    const ids = stringArray(row.habitual_zone_ids);
    return {
      id: String(row.id),
      cameraId: String(row.camera_id),
      cameraName: String(camera?.name ?? "Câmera"),
      label: String(row.label),
      description: String(row.description ?? ""),
      status: String(row.profile_status ?? "active") as StaffOperationalProfile["status"],
      version: Number(row.profile_version ?? 1),
      updateMode: String(row.update_mode ?? "manual") as StaffOperationalProfile["updateMode"],
      minSimilarity: Number(row.min_similarity ?? 0.74),
      habitualZoneIds: ids,
      habitualZoneNames: zoneNames(ids, zoneMap),
      habitualActionCodes: stringArray(row.habitual_action_codes),
      habitualSessionTypes: stringArray(row.habitual_session_types),
      habitualWeekdays: numberArray(row.habitual_weekdays),
      shiftWindows: shiftWindows(row.shift_windows),
      recurringAppearanceSummary: appearanceSummary(row.recurring_appearance),
      observationCount: Number(row.observation_count ?? 0),
      distinctDaysCount: Number(row.distinct_days_count ?? 0),
      confidence: Number(row.profile_confidence ?? 0),
      lastObservedAt: row.last_observed_at ? String(row.last_observed_at) : null,
      lastReviewedAt: row.last_reviewed_at ? String(row.last_reviewed_at) : null,
      lockedFields: stringArray(row.locked_fields),
      pendingProposalCount: Array.isArray(row.proposals)
        ? row.proposals.filter((proposal: any) => proposal.status === "pending").length
        : 0,
    };
  });

  const candidates: StaffProfileCandidate[] = (candidatesResult.data ?? []).map((row: any) => {
    const camera = relationOne<{ name?: string }>(row.camera);
    const ids = stringArray(row.zone_ids);
    return {
      id: String(row.id),
      cameraId: String(row.camera_id),
      cameraName: String(camera?.name ?? "Câmera"),
      status: String(row.status) as StaffProfileCandidate["status"],
      suggestedLabel: String(row.suggested_label ?? "Perfil operacional provável"),
      zoneIds: ids,
      zoneNames: zoneNames(ids, zoneMap),
      actionCodes: stringArray(row.action_codes),
      sessionTypes: stringArray(row.session_types),
      weekdays: numberArray(row.weekdays),
      shiftWindows: shiftWindows(row.shift_windows),
      appearanceSummary: appearanceSummary(row.canonical_appearance),
      observationCount: Number(row.observation_count ?? 0),
      distinctDaysCount: Number(row.distinct_days_count ?? 0),
      confidence: Number(row.confidence ?? 0),
      firstSeenAt: String(row.first_seen_at),
      lastSeenAt: String(row.last_seen_at),
      expiresAt: String(row.expires_at),
      evidenceEventIds: stringArray(row.evidence_event_ids),
    };
  });

  const decisions: StaffProfileMatchDecision[] = (decisionsResult.data ?? []).map((row: any) => {
    const camera = relationOne<{ name?: string }>(row.camera);
    const profile = relationOne<{ label?: string }>(row.profile);
    const reasonObject = objectValue(row.reasons);
    const reasonList = Array.isArray(reasonObject.items)
      ? reasonObject.items.map(String)
      : Object.entries(reasonObject).map(([key, value]) => `${key}: ${String(value)}`);
    return {
      id: String(row.id),
      cameraId: String(row.camera_id),
      cameraName: String(camera?.name ?? "Câmera"),
      eventId: String(row.event_id),
      eventPersonId: String(row.event_person_id),
      staffProfileId: row.staff_profile_id ? String(row.staff_profile_id) : null,
      staffProfileLabel: profile?.label ? String(profile.label) : null,
      candidateId: row.candidate_id ? String(row.candidate_id) : null,
      decision: String(row.decision) as StaffProfileMatchDecision["decision"],
      reviewStatus: String(row.review_status) as StaffProfileMatchDecision["reviewStatus"],
      appearanceScore: Number(row.appearance_score ?? 0),
      zoneScore: Number(row.zone_score ?? 0),
      actionScore: Number(row.action_score ?? 0),
      scheduleScore: Number(row.schedule_score ?? 0),
      totalScore: Number(row.total_score ?? 0),
      reasons: reasonList,
      observedAt: String(row.observed_at),
    };
  });

  const proposals: StaffProfileUpdateProposal[] = (proposalsResult.data ?? []).map((row: any) => {
    const camera = relationOne<{ name?: string }>(row.camera);
    const profile = relationOne<{ label?: string }>(row.profile);
    const ids = stringArray(row.proposed_zone_ids);
    return {
      id: String(row.id),
      staffProfileId: String(row.staff_profile_id),
      staffProfileLabel: String(profile?.label ?? "Perfil operacional"),
      cameraId: String(row.camera_id),
      cameraName: String(camera?.name ?? "Câmera"),
      status: String(row.status) as StaffProfileUpdateProposal["status"],
      proposedZoneIds: ids,
      proposedZoneNames: zoneNames(ids, zoneMap),
      proposedActionCodes: stringArray(row.proposed_action_codes),
      proposedSessionTypes: stringArray(row.proposed_session_types),
      proposedWeekdays: numberArray(row.proposed_weekdays),
      proposedShiftWindows: shiftWindows(row.proposed_shift_windows),
      proposedAppearanceSummary: appearanceSummary(row.proposed_recurring_appearance),
      observationCount: Number(row.observation_count ?? 0),
      distinctDaysCount: Number(row.distinct_days_count ?? 0),
      confidence: Number(row.confidence ?? 0),
      reason: String(row.reason ?? "Novas observações disponíveis para revisão."),
      evidenceEventIds: stringArray(row.evidence_event_ids),
      createdAt: String(row.created_at),
      validUntil: String(row.valid_until),
    };
  });

  return {
    profiles,
    candidates,
    decisions,
    proposals,
    summary: {
      activeProfiles: profiles.filter((profile) => profile.status === "active").length,
      learningProfiles: profiles.filter((profile) => profile.updateMode === "reviewed_learning").length,
      pendingCandidates: candidates.filter((candidate) => candidate.status === "pending_review").length,
      pendingDecisions: decisions.length,
      pendingProposals: proposals.length,
    },
  };
}

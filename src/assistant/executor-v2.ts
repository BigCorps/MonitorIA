import { createHybridSearchV3, hybridSearchEnabled, hybridOperationEligible } from "./hybrid-search-v3";
import { searchEvents } from "@/src/lib/event-search-data";
import type { AssistantExecutionResult, AssistantPlanV2 } from "./v2-contracts";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function collectEvidence(value: unknown) {
  const found = new Set<string>();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const visit = (current: unknown, key = "", depth = 0) => {
    if (depth > 8 || found.size >= 36 || current == null) return;
    if (typeof current === "string") {
      if (uuid.test(current) && /(event|evidence)/i.test(key) && !/(session|profile|observation)/i.test(key)) found.add(current);
      return;
    }
    if (Array.isArray(current)) return current.forEach((item) => visit(item, key, depth + 1));
    if (typeof current === "object") Object.entries(current as Record<string, unknown>).forEach(([k, v]) => visit(v, k, depth + 1));
  };
  visit(value);
  return [...found];
}

async function rpc(supabase: any, name: string, args: Record<string, unknown>) {
  const result = await supabase.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  return result.data;
}

export async function executeAssistantPlanV2(input: {
  supabase: any;
  organizationId: string;
  plan: AssistantPlanV2;
  fromIso: string;
  toIso: string;
  compareFromIso: string | null;
  compareToIso: string | null;
}): Promise<AssistantExecutionResult> {
  const { supabase, organizationId, plan, fromIso, toIso } = input;
  const coverage = objectValue(await rpc(supabase, "assistant_coverage_summary_v2", {
    p_organization_id: organizationId,
    p_from: fromIso,
    p_to: toIso,
    p_camera_id: plan.legacyPlan.cameraId,
    p_site_id: plan.legacyPlan.siteId,
  }));

  let calibratedCache: unknown | undefined;
  const calibrated = async () => {
    if (calibratedCache !== undefined) return calibratedCache;
    calibratedCache = await rpc(supabase, "assistant_calibrated_activity_summary_v1", {
      p_organization_id: organizationId,
      p_from: fromIso,
      p_to: toIso,
      p_camera_id: plan.legacyPlan.cameraId,
      p_site_id: plan.legacyPlan.siteId,
    });
    return calibratedCache;
  };

  const operationResults: Record<string, unknown> = {};
  const hybridTelemetry: unknown[] = [];
  const hybrid = hybridSearchEnabled(organizationId) ? createHybridSearchV3(async (args) =>
    supabase.rpc("assistant_hybrid_event_search_v3", args).abortSignal(AbortSignal.timeout(2000))) : null;

  for (const op of plan.operations) {
    const cameraId = op.cameraId ?? plan.legacyPlan.cameraId;
    const siteId = op.siteId ?? plan.legacyPlan.siteId;

    switch (op.kind) {
      case "period_summary": {
        const summary = await rpc(supabase, "assistant_period_summary", {
          p_organization_id: organizationId,
          p_from: fromIso,
          p_to: toIso,
          p_camera_id: cameraId,
          p_site_id: siteId,
        });
        operationResults[op.id] = { summary, calibratedActivity: await calibrated() };
        break;
      }
      case "search_events": {
        const hybridResult = hybrid && hybridOperationEligible(op) &&
          !plan.plannerNotes.includes("adolescent:unsupported_separate_class") &&
          !["NO_COVERAGE", "FEATURE_DISABLED"].includes(String(coverage.dataState))
          ? await hybrid({ organizationId, from: fromIso, to: toIso,
            query: plan.legacyPlan.query || op.subject || "", cameraId, siteId,
            operation: op, limit: plan.legacyPlan.evidenceLimit }) : null;
        if (hybridResult) {
          operationResults[op.id] = hybridResult.result;
          hybridTelemetry.push(hybridResult.telemetry);
          break;
        }
        if (
          op.zoneId ||
          op.apparentAgeGroup ||
          op.afterConfirmedClosing !== null ||
          op.eventTypes.length
        ) {
          operationResults[op.id] = await rpc(
            supabase,
            "assistant_structured_event_search_v3",
            {
              p_organization_id: organizationId,
              p_from: fromIso,
              p_to: toIso,
              p_camera_id: cameraId,
              p_site_id: siteId,
              p_zone_id: op.zoneId,
              p_event_types: op.eventTypes.length ? op.eventTypes : null,
              p_after_confirmed_closing: op.afterConfirmedClosing,
              p_requires_review: null,
              p_apparent_age_group: op.apparentAgeGroup,
              p_limit: plan.legacyPlan.evidenceLimit,
            },
          );
        } else {
          const result = await searchEvents(organizationId, {
            query: plan.legacyPlan.query || null,
            from: fromIso,
            to: toIso,
            cameraId,
            siteId,
            limit: plan.legacyPlan.evidenceLimit,
            offset: 0,
            throwOnError: true,
          });
          operationResults[op.id] = { total: result.total, events: result.rows };
        }
        break;
      }
      case "compare_periods": {
        if (!input.compareFromIso || !input.compareToIso) {
          operationResults[op.id] = {};
          break;
        }
        const [a, b] = await Promise.all([
          rpc(supabase, "assistant_period_summary", {
            p_organization_id: organizationId, p_from: fromIso, p_to: toIso,
            p_camera_id: cameraId, p_site_id: siteId,
          }),
          rpc(supabase, "assistant_period_summary", {
            p_organization_id: organizationId, p_from: input.compareFromIso, p_to: input.compareToIso,
            p_camera_id: cameraId, p_site_id: siteId,
          }),
        ]);
        operationResults[op.id] = {
          periodA: { summary: a },
          periodB: { summary: b },
        };
        break;
      }
      case "routine_deviation":
        operationResults[op.id] = await rpc(supabase, "assistant_routine_deviation_summary", {
          p_organization_id: organizationId, p_from: fromIso, p_to: toIso,
          p_camera_id: cameraId, p_site_id: siteId,
        });
        break;
      case "operating_hours":
        operationResults[op.id] = await rpc(supabase, "assistant_operating_hours_summary", {
          p_organization_id: organizationId, p_from: fromIso, p_to: toIso,
          p_camera_id: cameraId, p_site_id: siteId,
        });
        break;
      case "camera_health_current":
        operationResults[op.id] = await rpc(supabase, "assistant_camera_health_summary_v1", {
          p_organization_id: organizationId, p_camera_id: cameraId, p_site_id: siteId,
        });
        break;
      case "camera_health_history":
        operationResults[op.id] = await rpc(supabase, "assistant_camera_health_history_v2", {
          p_organization_id: organizationId, p_from: fromIso, p_to: toIso,
          p_camera_id: cameraId, p_site_id: siteId,
        });
        break;
      case "cross_camera_sequence":
        operationResults[op.id] = await rpc(supabase, "assistant_cross_camera_journeys_v2", {
          p_organization_id: organizationId,
          p_from: fromIso,
          p_to: toIso,
          p_site_id: siteId,
          p_from_camera_id: op.fromCameraId,
          p_to_camera_id: op.toCameraId,
          p_subject_type: op.metric === "vehicles" ? "vehicle" : op.metric === "customers" ? "person" : null,
        });
        break;
      case "visual_state":
        operationResults[op.id] = await rpc(supabase, "assistant_visual_state_summary", {
          p_organization_id: organizationId, p_from: fromIso, p_to: toIso,
          p_camera_id: cameraId, p_site_id: siteId,
        });
        break;
      case "interactions":
        operationResults[op.id] = await rpc(supabase, "assistant_operational_sessions_summary", {
          p_organization_id: organizationId, p_from: fromIso, p_to: toIso,
          p_camera_id: cameraId, p_site_id: siteId,
        });
        break;
      case "continuity_people":
        operationResults[op.id] = await rpc(supabase, "assistant_continuity_summary", {
          p_organization_id: organizationId, p_from: fromIso, p_to: toIso,
          p_camera_id: cameraId, p_site_id: siteId,
        });
        break;
      case "continuity_vehicles":
        operationResults[op.id] = await rpc(supabase, "assistant_vehicle_continuity_summary", {
          p_organization_id: organizationId, p_from: fromIso, p_to: toIso,
          p_camera_id: cameraId, p_site_id: siteId,
        });
        break;
      case "staff_activity": {
        const [profiles, activity] = await Promise.all([
          rpc(supabase, "assistant_staff_operational_profile_summary_v1", {
            p_organization_id: organizationId, p_camera_id: cameraId, p_site_id: siteId,
          }),
          calibrated(),
        ]);
        operationResults[op.id] = { profiles, calibratedActivity: activity };
        break;
      }
      case "queue_analysis":
        operationResults[op.id] = await rpc(supabase, "assistant_queue_analysis_v1", {
          p_organization_id: organizationId, p_from: fromIso, p_to: toIso,
          p_camera_id: cameraId, p_site_id: siteId,
        });
        break;
      case "process_summary":
        operationResults[op.id] = await rpc(supabase, "assistant_operational_process_summary_v1", {
          p_organization_id: organizationId, p_from: fromIso, p_to: toIso,
          p_camera_id: cameraId, p_site_id: siteId,
        });
        break;
      case "attention_summary":
        operationResults[op.id] = await rpc(supabase, "assistant_attention_summary_v2", {
          p_organization_id: organizationId, p_from: fromIso, p_to: toIso,
          p_camera_id: cameraId, p_site_id: siteId,
        });
        break;
    }
  }

  const retrievedData = { operationResults, coverage, ...(hybridTelemetry.length ? { hybridTelemetry } : {}) };
  return {
    retrievedData,
    candidateEvidenceIds: [...new Set([
      ...collectEvidence(retrievedData),
      ...Object.values(operationResults).flatMap((value) => {
        const payload = objectValue(value);
        const events = payload.totalIsExact === false ? payload.events : null;
        return Array.isArray(events) ? events.map((event) => objectValue(event).id)
          .filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) : [];
      }),
    ])].slice(0, 12),
    coverage,
  };
}

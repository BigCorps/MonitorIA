import type {
  OperationalProcessDefinition,
  OperationalProcessDeviation,
  OperationalProcessInstance,
  OperationalProcessOverview,
} from "@/src/contracts/operational-process";
import { createClient } from "@/src/lib/supabase/server";

export type OperationalProcessOverviewInput = {
  from?: string | null;
  to?: string | null;
  cameraId?: string | null;
  siteId?: string | null;
  processCode?: string | null;
  status?: string | null;
  severity?: string | null;
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

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapDefinition(row: any): OperationalProcessDefinition {
  return {
    id: String(row.id),
    processCode: String(row.process_code),
    name: String(row.name),
    description: String(row.description ?? ""),
    sessionType: String(row.session_type),
    source: String(row.source) as OperationalProcessDefinition["source"],
    strictness: String(
      row.strictness,
    ) as OperationalProcessDefinition["strictness"],
    status: String(row.status) as OperationalProcessDefinition["status"],
    version: Number(row.version ?? 1),
    steps: (row.steps ?? [])
      .map((step: any) => ({
        id: String(step.id),
        stepCode: String(step.step_code),
        name: String(step.name),
        sortOrder: Number(step.sort_order),
        required: Boolean(step.required),
        repeatable: Boolean(step.repeatable),
        terminal: Boolean(step.terminal),
        acceptedChapterTypes: stringArray(step.accepted_chapter_types),
        minimumConfidence: Number(step.minimum_confidence ?? 0),
      }))
      .sort((a: { sortOrder: number }, b: { sortOrder: number }) =>
        a.sortOrder - b.sortOrder,
      ),
  };
}

function mapInstance(row: any): OperationalProcessInstance {
  const camera = relationOne<{ name?: string }>(row.camera);

  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    siteId: String(row.site_id),
    cameraId: String(row.camera_id),
    cameraName: String(camera?.name ?? "Câmera"),
    processDefinitionId: String(row.process_definition_id),
    operationalSessionId: String(row.operational_session_id),
    processCode: String(row.process_code),
    processName: String(row.process_name),
    status: String(row.status) as OperationalProcessInstance["status"],
    resultCode: String(row.result_code),
    startedAt: String(row.started_at),
    lastObservedAt: String(row.last_observed_at),
    endedAt: row.ended_at ? String(row.ended_at) : null,
    durationSeconds: Number(row.duration_seconds ?? 0),
    requiredStepsTotal: Number(row.required_steps_total ?? 0),
    requiredStepsCompleted: Number(row.required_steps_completed ?? 0),
    observedStepsCount: Number(row.observed_steps_count ?? 0),
    unexpectedStepsCount: Number(row.unexpected_steps_count ?? 0),
    progressRatio: Number(row.progress_ratio ?? 0),
    nextExpectedStepCode: row.next_expected_step_code
      ? String(row.next_expected_step_code)
      : null,
    confidence: Number(row.confidence ?? 0),
    title: String(row.title ?? row.process_name),
    summary: String(row.summary ?? ""),
    steps: (row.steps ?? [])
      .map((step: any) => ({
        id: String(step.id),
        stepCode: String(step.step_code),
        stepName: String(step.step_name),
        expectedOrder: Number(step.expected_order ?? 0),
        observedOrder:
          step.observed_order === null || step.observed_order === undefined
            ? null
            : Number(step.observed_order),
        status: String(step.status) as OperationalProcessInstance["steps"][number]["status"],
        observedAt: step.observed_at ? String(step.observed_at) : null,
        confidence: Number(step.confidence ?? 0),
        eventId: step.event_id ? String(step.event_id) : null,
        evidenceEventIds: stringArray(step.evidence_event_ids),
        metadata: objectValue(step.metadata),
      }))
      .sort(
        (a: { expectedOrder: number; observedOrder: number | null }, b: { expectedOrder: number; observedOrder: number | null }) =>
          (a.expectedOrder || a.observedOrder || 999) -
          (b.expectedOrder || b.observedOrder || 999),
      ),
  };
}

function mapDeviation(row: any): OperationalProcessDeviation {
  const camera = relationOne<{ name?: string }>(row.camera);

  return {
    id: String(row.id),
    processInstanceId: String(row.process_instance_id),
    cameraId: String(row.camera_id),
    cameraName: String(camera?.name ?? "Câmera"),
    deviationCode: String(
      row.deviation_code,
    ) as OperationalProcessDeviation["deviationCode"],
    status: String(row.status) as OperationalProcessDeviation["status"],
    severity: String(row.severity) as OperationalProcessDeviation["severity"],
    title: String(row.title),
    summary: String(row.summary),
    confidence: Number(row.confidence ?? 0),
    observedAt: String(row.observed_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    evidenceEventIds: stringArray(row.evidence_event_ids),
    data: objectValue(row.data),
  };
}

export async function getOperationalProcessOverview(
  organizationId: string,
  input: OperationalProcessOverviewInput = {},
): Promise<OperationalProcessOverview> {
  const supabase = await createClient();
  const limit = Math.max(1, Math.min(input.limit ?? 100, 250));

  let definitionQuery = supabase
    .from("operational_process_definitions")
    .select(`
      id,
      process_code,
      version,
      name,
      description,
      session_type,
      source,
      status,
      strictness,
      steps:operational_process_steps(
        id,
        step_code,
        name,
        sort_order,
        required,
        repeatable,
        terminal,
        accepted_chapter_types,
        minimum_confidence
      )
    `)
    .in("status", ["active", "draft"])
    .order("source", { ascending: false })
    .order("name", { ascending: true });

  let instanceQuery = supabase
    .from("operational_process_instances")
    .select(`
      id,
      organization_id,
      site_id,
      camera_id,
      process_definition_id,
      operational_session_id,
      process_code,
      process_name,
      status,
      result_code,
      started_at,
      last_observed_at,
      ended_at,
      duration_seconds,
      required_steps_total,
      required_steps_completed,
      observed_steps_count,
      unexpected_steps_count,
      progress_ratio,
      next_expected_step_code,
      confidence,
      title,
      summary,
      camera:cameras(name),
      steps:operational_process_instance_steps(
        id,
        step_code,
        step_name,
        expected_order,
        observed_order,
        status,
        observed_at,
        confidence,
        event_id,
        evidence_event_ids,
        metadata
      )
    `)
    .eq("organization_id", organizationId)
    .order("started_at", { ascending: false })
    .limit(limit);

  let deviationQuery = supabase
    .from("operational_process_deviations")
    .select(`
      id,
      process_instance_id,
      camera_id,
      deviation_code,
      status,
      severity,
      title,
      summary,
      confidence,
      observed_at,
      resolved_at,
      evidence_event_ids,
      data,
      camera:cameras(name)
    `)
    .eq("organization_id", organizationId)
    .order("observed_at", { ascending: false })
    .limit(limit);

  if (input.from) {
    instanceQuery = instanceQuery.gte("started_at", input.from);
    deviationQuery = deviationQuery.gte("observed_at", input.from);
  }
  if (input.to) {
    instanceQuery = instanceQuery.lt("started_at", input.to);
    deviationQuery = deviationQuery.lt("observed_at", input.to);
  }
  if (input.cameraId) {
    instanceQuery = instanceQuery.eq("camera_id", input.cameraId);
    deviationQuery = deviationQuery.eq("camera_id", input.cameraId);
  }
  if (input.siteId) instanceQuery = instanceQuery.eq("site_id", input.siteId);
  if (input.processCode && input.processCode !== "all") {
    instanceQuery = instanceQuery.eq("process_code", input.processCode);
  }
  if (input.status && input.status !== "all") {
    instanceQuery = instanceQuery.eq("status", input.status);
  }
  if (input.severity && input.severity !== "all") {
    deviationQuery = deviationQuery.eq("severity", input.severity);
  } else {
    deviationQuery = deviationQuery.in("status", ["active", "informational"]);
  }

  const [definitionResult, instanceResult, deviationResult] = await Promise.all([
    definitionQuery,
    instanceQuery,
    deviationQuery,
  ]);

  if (definitionResult.error) {
    console.error("Falha ao carregar definições de processo:", definitionResult.error.message);
  }
  if (instanceResult.error) {
    console.error("Falha ao carregar processos observados:", instanceResult.error.message);
  }
  if (deviationResult.error) {
    console.error("Falha ao carregar desvios de processo:", deviationResult.error.message);
  }

  const definitions = (definitionResult.data ?? []).map(mapDefinition);
  const instances = (instanceResult.data ?? []).map(mapInstance);
  const deviations = (deviationResult.data ?? []).map(mapDeviation);

  return {
    definitions,
    instances,
    deviations,
    summary: {
      totalProcesses: instances.length,
      openProcesses: instances.filter((item) => item.status === "open").length,
      completedProcesses: instances.filter((item) => item.status === "completed").length,
      incompleteProcesses: instances.filter((item) => item.status === "incomplete").length,
      activeDeviations: deviations.filter((item) => item.status === "active").length,
      importantDeviations: deviations.filter(
        (item) =>
          item.status === "active" &&
          (item.severity === "high" || item.severity === "critical"),
      ).length,
    },
  };
}

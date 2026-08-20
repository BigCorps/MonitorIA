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

export type OperationalProcessDashboardDefinition =
  Omit<OperationalProcessDefinition, "steps"> & {
    organizationId: string | null;
    siteId: string | null;
    siteName: string | null;
    cameraId: string | null;
    cameraName: string | null;
    scopeKey: string;
    metadata: Record<string, unknown>;
    steps: Array<
      OperationalProcessDefinition["steps"][number] & {
        description: string;
        metadata: Record<string, unknown>;
        recommendedRequired: boolean;
      }
    >;
  };

export type OperationalProcessDashboardInstance =
  OperationalProcessInstance & {
    siteName: string;
    timezone: string;
    definitionSource: string;
    definitionVersion: number;
    definitionScopeKey: string;
  };

export type ProcessRefinementSuggestion = {
  key: string;
  processDefinitionId: string;
  processCode: string;
  processName: string;
  kind: "missing" | "order" | "additional";
  count: number;
  title: string;
  detail: string;
  stepCode: string | null;
  chapterType: string | null;
};

export type OperationalProcessDashboardOverview = Omit<
  OperationalProcessOverview,
  "definitions" | "instances"
> & {
  definitions: OperationalProcessDashboardDefinition[];
  instances: OperationalProcessDashboardInstance[];
  history: OperationalProcessDashboardDefinition[];
  refinements: ProcessRefinementSuggestion[];
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

function mapDefinition(row: any): OperationalProcessDashboardDefinition {
  const site = relationOne<{ name?: string }>(row.site);
  const camera = relationOne<{ name?: string }>(row.camera);

  return {
    id: String(row.id),
    organizationId: row.organization_id ? String(row.organization_id) : null,
    siteId: row.site_id ? String(row.site_id) : null,
    siteName: site?.name ? String(site.name) : null,
    cameraId: row.camera_id ? String(row.camera_id) : null,
    cameraName: camera?.name ? String(camera.name) : null,
    scopeKey: String(row.scope_key ?? ""),
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
    metadata: objectValue(row.metadata),
    steps: (row.steps ?? [])
      .map((step: any) => {
        const metadata = objectValue(step.metadata);
        return {
          id: String(step.id),
          stepCode: String(step.step_code),
          name: String(step.name),
          description: String(step.description ?? ""),
          sortOrder: Number(step.sort_order),
          required: Boolean(step.required),
          recommendedRequired:
            typeof metadata.recommendedRequired === "boolean"
              ? Boolean(metadata.recommendedRequired)
              : Boolean(step.required),
          repeatable: Boolean(step.repeatable),
          terminal: Boolean(step.terminal),
          acceptedChapterTypes: stringArray(step.accepted_chapter_types),
          minimumConfidence: Number(step.minimum_confidence ?? 0),
          metadata,
        };
      })
      .sort(
        (a: { sortOrder: number }, b: { sortOrder: number }) =>
          a.sortOrder - b.sortOrder,
      ),
  };
}

function mapInstance(row: any): OperationalProcessDashboardInstance {
  const camera = relationOne<{ name?: string }>(row.camera);
  const site = relationOne<{ name?: string; timezone?: string }>(row.site);
  const definition = relationOne<{
    source?: string;
    version?: number;
    scope_key?: string;
  }>(row.definition);

  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    siteId: String(row.site_id),
    siteName: String(site?.name ?? "Local"),
    timezone: String(site?.timezone ?? "America/Sao_Paulo"),
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
    definitionSource: String(definition?.source ?? "system"),
    definitionVersion: Number(definition?.version ?? 1),
    definitionScopeKey: String(definition?.scope_key ?? "system"),
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
        status: String(
          step.status,
        ) as OperationalProcessInstance["steps"][number]["status"],
        observedAt: step.observed_at ? String(step.observed_at) : null,
        confidence: Number(step.confidence ?? 0),
        eventId: step.event_id ? String(step.event_id) : null,
        evidenceEventIds: stringArray(step.evidence_event_ids),
        metadata: objectValue(step.metadata),
      }))
      .sort(
        (
          a: { expectedOrder: number; observedOrder: number | null },
          b: { expectedOrder: number; observedOrder: number | null },
        ) =>
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

function buildRefinements(
  definitions: OperationalProcessDashboardDefinition[],
  rows: Array<{
    process_definition_id: string;
    process_code: string;
    process_name: string;
    deviation_code: string;
    data: unknown;
  }>,
) {
  const customIds = new Set(
    definitions
      .filter((definition) => definition.source !== "system")
      .map((definition) => definition.id),
  );

  const buckets = new Map<
    string,
    {
      processDefinitionId: string;
      processCode: string;
      processName: string;
      kind: "missing" | "order" | "additional";
      stepCode: string | null;
      chapterType: string | null;
      count: number;
    }
  >();

  for (const row of rows) {
    if (!customIds.has(String(row.process_definition_id))) continue;

    const rowData = objectValue(row.data);
    const stepCode =
      typeof rowData.stepCode === "string" ? rowData.stepCode : null;
    const chapterType =
      typeof rowData.chapterType === "string" ? rowData.chapterType : null;

    let kind: "missing" | "order" | "additional" | null = null;
    let discriminator = "";

    if (row.deviation_code === "missing_required_step" && stepCode) {
      kind = "missing";
      discriminator = stepCode;
    } else if (row.deviation_code === "out_of_order_step" && stepCode) {
      kind = "order";
      discriminator = stepCode;
    } else if (row.deviation_code === "unexpected_step" && chapterType) {
      kind = "additional";
      discriminator = chapterType;
    }

    if (!kind) continue;

    const key = `${row.process_definition_id}:${kind}:${discriminator}`;
    const current = buckets.get(key);

    if (current) {
      current.count += 1;
    } else {
      buckets.set(key, {
        processDefinitionId: String(row.process_definition_id),
        processCode: String(row.process_code),
        processName: String(row.process_name),
        kind,
        stepCode,
        chapterType,
        count: 1,
      });
    }
  }

  return [...buckets.entries()]
    .filter(([, value]) => value.count >= 3)
    .map(([key, value]): ProcessRefinementSuggestion => {
      if (value.kind === "missing") {
        return {
          ...value,
          key,
          title: "Vale revisar se esta etapa precisa ser obrigatória",
          detail: `A mesma etapa não foi confirmada em ${value.count} processos recentes. O MonitorIA não vai alterar a regra sozinho.`,
        };
      }

      if (value.kind === "order") {
        return {
          ...value,
          key,
          title: "A ordem observada está se repetindo de outra forma",
          detail: `A mesma etapa apareceu fora da ordem definida ${value.count} vezes. Revise a sequência antes de criar uma nova versão.`,
        };
      }

      return {
        ...value,
        key,
        title: "Uma ação adicional está se repetindo",
        detail: `Este tipo de ação apareceu ${value.count} vezes sem etapa correspondente. Revise se deve entrar na próxima versão.`,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

export async function getOperationalProcessOverview(
  organizationId: string,
  input: OperationalProcessOverviewInput = {},
): Promise<OperationalProcessDashboardOverview> {
  const supabase = await createClient();
  const limit = Math.max(1, Math.min(input.limit ?? 100, 250));

  const definitionQuery = supabase
    .from("operational_process_definitions")
    .select(`
      id,
      organization_id,
      site_id,
      camera_id,
      scope_key,
      process_code,
      version,
      name,
      description,
      session_type,
      source,
      status,
      strictness,
      metadata,
      site:sites(name),
      camera:cameras(name),
      steps:operational_process_steps(
        id,
        step_code,
        name,
        description,
        sort_order,
        required,
        repeatable,
        terminal,
        accepted_chapter_types,
        minimum_confidence,
        metadata
      )
    `)
    .in("status", ["active", "draft"])
    .order("source", { ascending: false })
    .order("name", { ascending: true });

  const historyQuery = supabase
    .from("operational_process_definitions")
    .select(`
      id,
      organization_id,
      site_id,
      camera_id,
      scope_key,
      process_code,
      version,
      name,
      description,
      session_type,
      source,
      status,
      strictness,
      metadata,
      site:sites(name),
      camera:cameras(name),
      steps:operational_process_steps(
        id,
        step_code,
        name,
        description,
        sort_order,
        required,
        repeatable,
        terminal,
        accepted_chapter_types,
        minimum_confidence,
        metadata
      )
    `)
    .eq("organization_id", organizationId)
    .in("status", ["archived", "paused"])
    .order("updated_at", { ascending: false })
    .limit(60);

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
      site:sites(name,timezone),
      definition:operational_process_definitions(source,version,scope_key),
      session:operational_sessions(id,chapter_count),
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
    .eq("status", "active")
    .order("observed_at", { ascending: false })
    .limit(limit);

  const refinementQuery = supabase
    .from("operational_process_deviations")
    .select(`
      deviation_code,
      data,
      instance:operational_process_instances(
        process_definition_id,
        process_code,
        process_name
      )
    `)
    .eq("organization_id", organizationId)
    .gte(
      "observed_at",
      new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    )
    .in("status", ["active", "resolved", "informational"])
    .limit(1000);

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
  if (input.siteId) {
    instanceQuery = instanceQuery.eq("site_id", input.siteId);
  }
  if (input.processCode && input.processCode !== "all") {
    instanceQuery = instanceQuery.eq("process_code", input.processCode);
  }
  if (input.status && input.status !== "all") {
    instanceQuery = instanceQuery.eq("status", input.status);
  }
  if (input.severity && input.severity !== "all") {
    deviationQuery = deviationQuery.eq("severity", input.severity);
  }

  const [
    definitionResult,
    historyResult,
    instanceResult,
    deviationResult,
    refinementResult,
  ] = await Promise.all([
    definitionQuery,
    historyQuery,
    instanceQuery,
    deviationQuery,
    refinementQuery,
  ]);

  if (definitionResult.error) {
    console.error(
      "Falha ao carregar definições de processo:",
      definitionResult.error.message,
    );
  }
  if (historyResult.error) {
    console.error(
      "Falha ao carregar histórico de processos:",
      historyResult.error.message,
    );
  }
  if (instanceResult.error) {
    console.error(
      "Falha ao carregar processos observados:",
      instanceResult.error.message,
    );
  }
  if (deviationResult.error) {
    console.error(
      "Falha ao carregar diferenças de processo:",
      deviationResult.error.message,
    );
  }

  const definitions = (definitionResult.data ?? []).map(mapDefinition);
  const history = (historyResult.data ?? []).map(mapDefinition);

  const instances = (instanceResult.data ?? [])
    .filter((row: any) => relationOne(row.session) !== null)
    .map(mapInstance);

  const deviations = (deviationResult.data ?? []).map(mapDeviation);

  const refinementRows = (refinementResult.data ?? []).flatMap((row: any) => {
    const instance = relationOne<{
      process_definition_id?: string;
      process_code?: string;
      process_name?: string;
    }>(row.instance);

    if (!instance?.process_definition_id) return [];

    return [
      {
        process_definition_id: String(instance.process_definition_id),
        process_code: String(instance.process_code ?? ""),
        process_name: String(instance.process_name ?? "Processo"),
        deviation_code: String(row.deviation_code),
        data: row.data,
      },
    ];
  });

  const refinements = buildRefinements(definitions, refinementRows);

  return {
    definitions,
    history,
    instances,
    deviations,
    refinements,
    summary: {
      totalProcesses: instances.length,
      openProcesses: instances.filter((item) => item.status === "open").length,
      completedProcesses: instances.filter(
        (item) =>
          item.definitionSource === "system"
            ? item.status !== "open" && item.status !== "aborted"
            : item.status === "completed",
      ).length,
      incompleteProcesses: instances.filter(
        (item) =>
          item.definitionSource !== "system" &&
          item.status === "incomplete",
      ).length,
      activeDeviations: deviations.length,
      importantDeviations: deviations.filter(
        (item) =>
          item.severity === "high" || item.severity === "critical",
      ).length,
    },
  };
}

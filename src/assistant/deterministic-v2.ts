import {
  answerDeterministically,
  planDeterministically,
} from "./deterministic";
import {
  AssistantAnswerSchema,
  AssistantPlanSchema,
  type AssistantAnswer,
  type AssistantPlan,
} from "./contracts";
import {
  AssistantPlanV2Schema,
  type AssistantDirectoryV2,
  type AssistantHistoryItemV2,
  type AssistantOperation,
  type AssistantPlanV2,
} from "./v2-contracts";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[“”"'`´]/g, " ")
    .replace(/[^a-z0-9:@/._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function names(value: { name: string; aliases?: string[] }) {
  return [value.name, ...(value.aliases ?? [])]
    .map(normalize)
    .filter((item) => item.length >= 2);
}

function bestNamedMatch<T extends { name: string; aliases?: string[] }>(
  normalized: string,
  items: T[],
) {
  const matches = items
    .map((item) => ({
      item,
      score: Math.max(
        0,
        ...names(item).map((name) =>
          normalized.includes(name)
            ? 1
            : name
                .split(" ")
                .filter((token) => token.length >= 3)
                .filter((token) => normalized.includes(token)).length /
              Math.max(1, name.split(" ").filter((token) => token.length >= 3).length),
        ),
      ),
    }))
    .filter((candidate) => candidate.score >= 0.67)
    .sort((a, b) => b.score - a.score);
  if (!matches.length) return { item: null as T | null, ambiguous: false };
  const ambiguous = Boolean(matches[1] && Math.abs(matches[0].score - matches[1].score) < 0.08);
  return { item: ambiguous ? null : matches[0].item, ambiguous };
}

function cameraMentions(normalized: string, directory: AssistantDirectoryV2) {
  return directory.cameras
    .map((camera) => ({ camera, index: normalized.indexOf(normalize(camera.name)) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
}

function operation(
  id: string,
  kind: AssistantOperation["kind"],
  aggregation: AssistantOperation["aggregation"],
  metric: AssistantOperation["metric"],
  legacy: AssistantPlan,
  patch: Partial<AssistantOperation> = {},
): AssistantOperation {
  return {
    id,
    kind,
    aggregation,
    metric,
    subject: null,
    cameraId: legacy.cameraId,
    siteId: legacy.siteId,
    fromCameraId: null,
    toCameraId: null,
    zoneId: null,
    visualEntityId: null,
    processId: null,
    eventTypes: [],
    apparentAgeGroup: null,
    afterConfirmedClosing: null,
    ...patch,
  };
}

function metricFromText(n: string): AssistantOperation["metric"] {
  if (/\b(clientes?|atendimentos? de clientes?)\b/.test(n)) return "customers";
  if (/\b(funcionarios?|funcionarios|equipe|staff)\b/.test(n)) return "staff";
  if (/\b(entregas?|pacotes?|entregadores?)\b/.test(n)) return "deliveries";
  if (/\b(veiculos?|carros?|motos?|caminhoes?)\b/.test(n)) return "vehicles";
  if (/\b(objetos?|itens?|caixas?|pacotes?)\b/.test(n)) return "objects";
  return "events";
}

function legacyKind(intent: AssistantPlan["intent"]): AssistantOperation["kind"] {
  switch (intent) {
    case "search_events": return "search_events";
    case "compare_periods": return "compare_periods";
    case "routine_deviation": return "routine_deviation";
    case "operating_hours": return "operating_hours";
    case "camera_health": return "camera_health_current";
    case "cross_camera_sequence": return "cross_camera_sequence";
    case "visual_state":
    case "object_history":
    case "equipment_history": return "visual_state";
    case "interaction_sessions":
    case "interaction_summary": return "interactions";
    case "continuity_summary": return "continuity_people";
    case "vehicle_continuity": return "continuity_vehicles";
    case "staff_activity": return "staff_activity";
    case "queue_analysis": return "queue_analysis";
    default: return "period_summary";
  }
}

function aggregationFromText(n: string): AssistantOperation["aggregation"] {
  if (/\b(compare|comparar|comparacao|versus|vs\.?|em relacao)\b/.test(n)) return "compare";
  if (/\bqual\b.*\b(mais|maior|menor)\b/.test(n)) return "rank";
  if (/\b(pico|horario mais|hora mais)\b/.test(n)) return "peak";
  if (/\b(media|média|medio|médio)\b/.test(n)) return "average";
  if (/\bquantos?|quantas?|total\b/.test(n)) return "count";
  if (/\b(mostre|liste|listar|quais)\b/.test(n)) return "list";
  if (/\b(houve|teve|existiu|aconteceu)\b/.test(n)) return "exists";
  return "summary";
}

function explicitHistorical(n: string, currentDate: string, plan: AssistantPlan) {
  if (/\b(ontem|anteontem|semana passada|mes passado|últimos|ultimos|dias atras|atrás)\b/.test(n)) return true;
  if (/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(n)) return true;
  if (/\b20\d{2}-\d{2}-\d{2}\b/.test(n)) return plan.fromDate !== currentDate || plan.toDate !== currentDate;
  return Boolean(plan.toDate && plan.toDate < currentDate);
}

function uniqueOperations(ops: AssistantOperation[]) {
  const seen = new Set<string>();
  return ops.filter((op) => {
    const key = [
      op.kind,
      op.aggregation,
      op.metric,
      op.cameraId,
      op.siteId,
      op.zoneId,
      op.apparentAgeGroup,
      op.visualEntityId,
      op.processId,
      op.fromCameraId,
      op.toCameraId,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6).map((op, index) => ({ ...op, id: `op${index + 1}` }));
}

function priorStructuredPlan(history: AssistantHistoryItemV2[]) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const parsed = AssistantPlanV2Schema.safeParse(history[i]?.plan);
    if (parsed.success) return parsed.data;
  }
  return null;
}

export function planDeterministicallyV2(input: {
  message: string;
  currentDate: string;
  timezone: string;
  selectedFrom: string | null;
  selectedTo: string | null;
  selectedCameraId: string | null;
  selectedSiteId: string | null;
  directory: AssistantDirectoryV2;
  history: AssistantHistoryItemV2[];
}) {
  const base = planDeterministically({
    ...input,
    directory: { sites: input.directory.sites, cameras: input.directory.cameras },
    history: input.history.map(({ role, content }) => ({ role, content })),
  });
  const n = normalize(input.message);
  let legacy = base.plan;
  const notes: string[] = [];
  const ops: AssistantOperation[] = [];

  const zone = bestNamedMatch(n, input.directory.zones);
  const entity = bestNamedMatch(n, input.directory.visualEntities);
  const process = bestNamedMatch(n, input.directory.processes);
  const apparentAgeGroup: AssistantOperation["apparentAgeGroup"] =
    /\b(criancas?|crianca|bebes?|bebe|infantil|infancia)\b/.test(n)
      ? "child"
      : /\badultos?\b/.test(n)
        ? "adult"
        : null;
  const mentionsAdolescent = /\badolescentes?\b/.test(n);
  const availablePeriod =
    /\b(todos os dias existentes|todos os registros existentes|todo o periodo disponivel|periodo completo|desde o primeiro registro)\b/.test(
      n,
    );

  if (availablePeriod) {
    notes.push("period:available");
  }

  if (zone.item) {
    legacy = AssistantPlanSchema.parse({
      ...legacy,
      cameraId: legacy.cameraId ?? zone.item.cameraId,
      siteId: legacy.siteId ?? zone.item.siteId,
    });
    notes.push(`zone:${zone.item.name}`);
  }
  if (entity.item) {
    legacy = AssistantPlanSchema.parse({
      ...legacy,
      cameraId: legacy.cameraId ?? entity.item.cameraId,
      siteId: legacy.siteId ?? entity.item.siteId,
      intent: "visual_state",
    });
    ops.push(operation("entity", "visual_state", aggregationFromText(n), "objects", legacy, {
      visualEntityId: entity.item.id,
      subject: entity.item.name,
    }));
    notes.push(`visual_entity:${entity.item.name}`);
  }
  if (process.item || /\b(processo|procedimento|etapa|fluxo)\b/.test(n)) {
    const item = process.item;
    const processLegacy = AssistantPlanSchema.parse({
      ...legacy,
      cameraId: legacy.cameraId ?? item?.cameraId ?? null,
      siteId: legacy.siteId ?? item?.siteId ?? null,
    });
    ops.push(operation("process", "process_summary", aggregationFromText(n), "processes", processLegacy, {
      processId: item?.id ?? null,
      subject: item?.name ?? null,
    }));
  }

  if (/\b(o que merece.*atencao|merece minha atencao|atencao agora|alertas?|incidentes?|problemas importantes|o que e importante|prioridade)\b/.test(n)) {
    ops.push(operation("attention", "attention_summary", "summary", "attention", legacy));
  }

  if (/\b(camer\w*|imagem)\b.*\b(offline|escura|luminos|desfoc|embacad|obstru|movid|enquadr|congelad|saude|problema)\b|\b(offline|baixa luminosidade|desfocada|obstruida)\b/.test(n)) {
    const history = explicitHistorical(n, input.currentDate, legacy);
    ops.push(operation("health", history ? "camera_health_history" : "camera_health_current", aggregationFromText(n), "camera_health", legacy));
  }

  if (/\b(passagem|trajeto|sequencia|percurso|entre cameras|entre camera)\b/.test(n)) {
    const mentions = cameraMentions(n, input.directory);
    const fromTo = /\b(de|da|do)\b.+\bpara\b/.test(n) && mentions.length >= 2;
    ops.push(operation("journey", "cross_camera_sequence", aggregationFromText(n), metricFromText(n), legacy, {
      fromCameraId: fromTo ? mentions[0].camera.id : null,
      toCameraId: fromTo ? mentions[1].camera.id : null,
      siteId: legacy.siteId ?? mentions[0]?.camera.siteId ?? null,
    }));
  }

  if (/\b(depois|apos|após)\b.*\b(fechamento|fechar|expediente)\b|\b(fora do padrao|fora do normal|desvio|anomali|mais tarde|mais cedo)\b/.test(n)) {
    ops.push(operation("routine", "routine_deviation", aggregationFromText(n), "routine", legacy, {
      afterConfirmedClosing: /\b(depois|apos|após).*\b(fechamento|expediente)\b/.test(n) ? true : null,
    }));
  }

  if (/\b(abriu|abertura|fechou|fechamento|horario de funcionamento|horário de funcionamento)\b/.test(n) && !/\bdepois|apos|após\b/.test(n)) {
    ops.push(operation("hours", "operating_hours", aggregationFromText(n), "none", legacy));
  }

  if (/\b(fila|espera|aguardando)\b/.test(n)) {
    ops.push(operation("queue", "queue_analysis", aggregationFromText(n), "customers", legacy));
  }

  if (/\b(atendimentos?|visitas?|entregas?)\b/.test(n) && /\b(duracao|duração|durou|sessoes|sessões|lista|mostre|quantos?)\b/.test(n)) {
    ops.push(operation("interactions", "interactions", aggregationFromText(n), metricFromText(n), legacy));
  }

  if (/\b(pessoas?|clientes?)\b.*\b(distint|unicos|únicos|mesma visita)\b/.test(n)) {
    ops.push(operation("people", "continuity_people", aggregationFromText(n), "customers", legacy));
  }
  if (/\b(veiculos?|carros?|motos?)\b.*\b(distint|unicos|únicos|voltou|retornou|permaneceu)\b/.test(n)) {
    ops.push(operation("vehicles", "continuity_vehicles", aggregationFromText(n), "vehicles", legacy));
  }
  if (/\b(funcionarios?|funcionários|equipe|staff)\b.*\b(atividade|padrao|padrão|rotina|presenca|presença)\b/.test(n)) {
    ops.push(operation("staff", "staff_activity", aggregationFromText(n), "staff", legacy));
  }

  if (apparentAgeGroup) {
    legacy = AssistantPlanSchema.parse({
      ...legacy,
      intent: "search_events",
      query: "",
    });
    ops.push(
      operation(
        "age_group",
        "search_events",
        aggregationFromText(n),
        "events",
        legacy,
        {
          zoneId: zone.item?.id ?? null,
          subject:
            apparentAgeGroup === "child"
              ? "Provável criança"
              : "Provável adulto",
          apparentAgeGroup,
        },
      ),
    );
    notes.push(`apparent_age_group:${apparentAgeGroup}`);
    if (mentionsAdolescent) {
      notes.push("adolescent:not_separate_class");
    }
  } else if (mentionsAdolescent) {
    notes.push("adolescent:unsupported_separate_class");
  }

  const explicitCountMetric = n.match(/\bquantos?|quantas?|total\b/) && /\b(clientes?|funcionarios?|funcionários|entregas?|veiculos?|veículos|carros?|motos?|eventos?)\b/.test(n);
  if (explicitCountMetric) {
    ops.push(operation("count_metric", "period_summary", "count", metricFromText(n), legacy));
  }
  if (/\bqual\b.*\bcamera\b.*\b(mais|maior)\b.*\b(eventos|movimento|atividade)\b/.test(n)) {
    ops.push(operation("rank_camera", "period_summary", "rank", "events", legacy));
  }
  if (/\b(pico|horario mais|hora mais)\b/.test(n)) {
    ops.push(operation("peak", "period_summary", "peak", "events", legacy));
  }
  const asksPeriodMetric = /\b(media|média|mais movimento|mais eventos)\b/.test(n);
  if (asksPeriodMetric && !explicitCountMetric && !/\bqual\b.*\bcamera\b/.test(n)) {
    ops.push(operation("metric", "period_summary", aggregationFromText(n), metricFromText(n), legacy));
  }

  if (legacy.intent === "compare_periods") {
    ops.push(operation("compare", "compare_periods", "compare", metricFromText(n), legacy));
  }

  if (legacy.intent === "search_events" || zone.item) {
    ops.push(operation("search", "search_events", aggregationFromText(n), metricFromText(n), legacy, {
      zoneId: zone.item?.id ?? null,
      subject: zone.item?.name ?? null,
      afterConfirmedClosing: /\b(depois|apos|após).*\b(fechamento|expediente)\b/.test(n) ? true : null,
    }));
  }

  let operations = uniqueOperations(ops);
  if (!operations.length) {
    operations = [operation("op1", legacyKind(legacy.intent), aggregationFromText(n), metricFromText(n), legacy)];
  }

  const prior = priorStructuredPlan(input.history);
  const elliptical = n.length <= 55 && (/^e\b/.test(n) || /^(ontem|anteontem|semana passada|no|na|so|só|apenas)\b/.test(n));
  if (elliptical && prior && operations.length === 1 && base.plan.intent === "period_summary") {
    operations = prior.operations.map((op, index) => ({
      ...op,
      id: `op${index + 1}`,
      cameraId: legacy.cameraId ?? op.cameraId,
      siteId: legacy.siteId ?? op.siteId,
    }));
    notes.push("structured_context_reused");
  }

  const ambiguous = zone.ambiguous || entity.ambiguous || process.ambiguous;
  const understood = !ambiguous && (base.understood || operations.length > 1 || Boolean(zone.item || entity.item || process.item));
  const confidence = Math.max(0.1, Math.min(0.99, ambiguous ? 0.35 : operations.length > 1 ? Math.max(base.confidence, 0.86) : base.confidence));

  return {
    plan: AssistantPlanV2Schema.parse({ version: 2, legacyPlan: legacy, operations, plannerNotes: notes }),
    confidence,
    understood,
    reason: ambiguous ? "rich_entity_ambiguous" : understood ? "deterministic_v2" : base.reason,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function arrayValue(value: unknown) { return Array.isArray(value) ? value : []; }
function numberValue(value: unknown) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function stringValue(value: unknown) { return typeof value === "string" ? value : String(value ?? ""); }
function formatTime(value: unknown) {
  const text = stringValue(value);
  const m = text.match(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/);
  return m?.[0] ?? null;
}

function coverageCaution(coverage: Record<string, unknown> | null) {
  const state = stringValue(coverage?.dataState);
  if (state === "NO_COVERAGE") return "Não houve cobertura suficiente nesse recorte. Zero registros não deve ser interpretado como prova de que nada aconteceu.";
  if (state === "PARTIAL_COVERAGE") return "A cobertura foi parcial para parte das câmeras selecionadas; a resposta considera somente os dados disponíveis.";
  if (state === "STALE_DATA") return "Há sinal de dados recentes desatualizados em pelo menos uma câmera; resultados de estado atual podem estar defasados.";
  if (state === "FEATURE_DISABLED") return "A inteligência necessária não está habilitada para esse recorte.";
  return null;
}

function customOperationAnswer(op: AssistantOperation, payload: Record<string, unknown>) {
  if (op.kind === "search_events" && op.apparentAgeGroup) {
    const total = numberValue(payload.total ?? payload.totalFound);
    const events = arrayValue(payload.events).map(objectValue);
    const label =
      op.apparentAgeGroup === "child"
        ? "provável criança"
        : "provável adulto";

    if (!total) {
      return `Não encontrei eventos com classificação visual de ${label} no período consultado.`;
    }

    const details = events
      .slice(0, 4)
      .map((event) => {
        const camera = stringValue(event.cameraName) || "Câmera";
        const headline =
          stringValue(event.headline) ||
          stringValue(event.summary) ||
          "Acontecimento";
        const at = formatTime(event.startedAt);
        return `${camera}: ${headline}${at ? `, às ${at}` : ""}.`;
      })
      .join(" ");

    return `Encontrei ${total} evento${total === 1 ? "" : "s"} com pelo menos uma classificação visual de ${label}. ${details}`.trim();
  }

  if (op.kind === "camera_health_history") {
    const summary = objectValue(payload.summary);
    const incidents = arrayValue(payload.incidents).map(objectValue);
    const count = numberValue(summary.incidentCount);
    if (!count) return "Não há incidente de saúde de câmera registrado no período consultado.";
    const details = incidents.slice(0, 3).map((i) => {
      const name = stringValue(i.cameraName) || "Câmera";
      const title = stringValue(i.title) || stringValue(i.summary) || stringValue(i.type);
      const at = formatTime(i.firstObservedAt);
      return `${name}: ${title}${at ? `, a partir de ${at}` : ""}${i.resolvedAt ? " (resolvido no período/histórico)" : ""}.`;
    });
    return `${count} incidente${count === 1 ? "" : "s"} de saúde foi${count === 1 ? "" : "ram"} encontrado${count === 1 ? "" : "s"} no período. ${details.join(" ")}`;
  }

  if (op.kind === "attention_summary") {
    const rows = [
      ...arrayValue(payload.alerts).map(objectValue),
      ...arrayValue(payload.deviations).map(objectValue),
      ...arrayValue(payload.healthIncidents).map(objectValue),
    ];
    const rank: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
    rows.sort((a, b) => (rank[stringValue(b.severity)] ?? 0) - (rank[stringValue(a.severity)] ?? 0));
    if (!rows.length) return "Não há alerta, desvio ou incidente técnico registrado para esse período.";
    const details = rows.slice(0, 4).map((row) => `${stringValue(row.cameraName) || stringValue(row.siteName) || "MonitorIA"}: ${stringValue(row.title) || stringValue(row.summary) || stringValue(row.code)}.`);
    return `Há ${rows.length} item${rows.length === 1 ? "" : "s"} que merece${rows.length === 1 ? "" : "m"} atenção pelos registros disponíveis. ${details.join(" ")}`;
  }

  if (op.kind === "visual_state" && op.subject) {
    const target = normalize(op.subject);
    const transitions = arrayValue(payload.transitions).map(objectValue).filter((row) => normalize(stringValue(row.entityName ?? row.entity_name)).includes(target) || target.includes(normalize(stringValue(row.entityName ?? row.entity_name))));
    const states = arrayValue(payload.currentStates).map(objectValue).filter((row) => normalize(stringValue(row.entityName ?? row.entity_name)).includes(target) || target.includes(normalize(stringValue(row.entityName ?? row.entity_name))));
    if (transitions.length) {
      const row = transitions[0];
      const at = formatTime(row.occurredAt ?? row.occurred_at);
      return `${op.subject} mudou de ${stringValue(row.fromState ?? row.from_state)} para ${stringValue(row.toState ?? row.to_state)}${at ? ` às ${at}` : ""}.`;
    }
    if (states.length) {
      const row = states[0];
      return `${op.subject} está no estado visual “${stringValue(row.state)}” na última observação disponível.`;
    }
    return `Não há estado visual suficiente de ${op.subject} no período consultado.`;
  }

  if (op.kind === "process_summary") {
    const rows = arrayValue(payload.instances ?? payload.processes).map(objectValue);
    if (!rows.length) return "Não há processo operacional consolidado compatível com a pergunta nesse período.";
    const filtered = op.processId ? rows.filter((row) => stringValue(row.process_definition_id ?? row.processDefinitionId) === op.processId) : rows;
    const chosen = filtered.length ? filtered : rows;
    const details = chosen.slice(0, 3).map((row) => {
      const name = stringValue(row.process_name ?? row.processName ?? row.title) || op.subject || "Processo";
      const status = stringValue(row.status || row.result_code || row.resultCode);
      const progress = Number(row.progress_ratio ?? row.progressRatio);
      return `${name}: ${status || "registro disponível"}${Number.isFinite(progress) && progress > 0 ? `, progresso ${(progress * 100).toFixed(0)}%` : ""}.`;
    });
    return details.join(" ");
  }

  if (op.kind === "cross_camera_sequence" && Array.isArray(payload.journeys)) {
    const journeys = payload.journeys.map(objectValue);
    if (!journeys.length) return "Não há passagem provável entre as câmeras compatível com os filtros no período.";
    const first = journeys[0];
    const direction = `${stringValue(first.fromCameraName)} → ${stringValue(first.toCameraName)}`;
    const travel = numberValue(first.travelSeconds);
    return `${journeys.length} passagem${journeys.length === 1 ? " provável" : "ens prováveis"} foi${journeys.length === 1 ? "" : "ram"} registrada${journeys.length === 1 ? "" : "s"}. A mais recente indica ${direction}${travel ? ` em cerca de ${travel}s` : ""}.`;
  }

  return null;
}

function legacyPayload(op: AssistantOperation, payload: Record<string, unknown>) {
  switch (op.kind) {
    case "period_summary": return { summary: payload.summary ?? payload, calibratedActivity: payload.calibratedActivity ?? {} };
    case "search_events": return { totalFound: payload.total ?? payload.totalFound ?? 0, events: payload.events ?? [] };
    case "compare_periods": return payload;
    case "routine_deviation": return { routineDeviation: payload };
    case "operating_hours": return { operatingHours: payload };
    case "camera_health_current": return { cameraHealth: payload };
    case "cross_camera_sequence": return { crossCameraSequence: payload };
    case "visual_state": return { visualStates: payload };
    case "interactions": return { operationalSessions: payload };
    case "continuity_people": return { continuity: payload };
    case "continuity_vehicles": return { vehicleContinuity: payload };
    case "staff_activity": return { staffOperationalProfiles: payload.profiles ?? payload, calibratedActivity: payload.calibratedActivity ?? {} };
    case "queue_analysis": return { queueAnalysis: payload };
    default: return payload;
  }
}

function legacyIntentForOperation(op: AssistantOperation): AssistantPlan["intent"] {
  switch (op.kind) {
    case "search_events": return "search_events";
    case "compare_periods": return "compare_periods";
    case "routine_deviation": return "routine_deviation";
    case "operating_hours": return "operating_hours";
    case "camera_health_current": return "camera_health";
    case "cross_camera_sequence": return "cross_camera_sequence";
    case "visual_state": return "visual_state";
    case "interactions": return "interaction_sessions";
    case "continuity_people": return "continuity_summary";
    case "continuity_vehicles": return "vehicle_continuity";
    case "staff_activity": return "staff_activity";
    case "queue_analysis": return "queue_analysis";
    default: return "period_summary";
  }
}

function messageForOperation(op: AssistantOperation, original: string) {
  const metricWord: Record<AssistantOperation["metric"], string> = {
    events: "eventos", customers: "clientes", staff: "funcionários", deliveries: "entregas",
    vehicles: "veículos", objects: "objetos", camera_health: "câmeras", routine: "rotina",
    attention: "atenção", processes: "processos", none: "eventos",
  };
  if (op.kind !== "period_summary") return original;
  if (op.aggregation === "count") return `Quantos ${metricWord[op.metric]} houve no período?`;
  if (op.aggregation === "rank") return "Qual câmera teve mais eventos no período?";
  if (op.aggregation === "peak") return "Qual horário teve o pico de eventos no período?";
  if (op.aggregation === "average") return `Qual a média de ${metricWord[op.metric]} no período?`;
  return original;
}

export function answerDeterministicallyV2(input: {
  message: string;
  plan: AssistantPlanV2;
  retrievedData: unknown;
  allowedEvidenceIds: string[];
}): AssistantAnswer {
  const data = objectValue(input.retrievedData);
  const operationResults = objectValue(data.operationResults);
  const parts: string[] = [];
  const cautions = new Set<string>();
  const evidence = new Set<string>();

  for (const op of input.plan.operations) {
    const payload = objectValue(operationResults[op.id]);
    const custom = customOperationAnswer(op, payload);
    if (custom) {
      parts.push(custom);
      if (op.kind === "cross_camera_sequence") cautions.add("Passagens entre câmeras são hipóteses por tempo e características visíveis; não confirmam identidade, rosto ou placa.");
      if (op.kind === "camera_health_history") cautions.add("Incidentes de saúde descrevem qualidade, conexão ou enquadramento; não determinam causa ou intenção.");
      if (op.kind === "search_events" && op.apparentAgeGroup) {
        cautions.add(
          "A faixa etária é uma triagem visual ampla e probabilística. Não determina idade exata, maioridade legal ou identidade; adolescência não é uma classe separada nesta versão.",
        );
      }
      continue;
    }

    const legacyPlan = AssistantPlanSchema.parse({
      ...input.plan.legacyPlan,
      intent: legacyIntentForOperation(op),
      cameraId: op.cameraId,
      siteId: op.siteId,
    });
    const answer = answerDeterministically({
      message: messageForOperation(op, input.message),
      plan: legacyPlan,
      retrievedData: legacyPayload(op, payload),
      allowedEvidenceIds: input.allowedEvidenceIds,
    });
    parts.push(answer.answer);
    if (answer.caution) cautions.add(answer.caution);
    for (const id of answer.evidenceEventIds) evidence.add(id);
  }

  const coverage = coverageCaution(objectValue(data.coverage));
  if (coverage) cautions.add(coverage);
  const allowed = new Set(input.allowedEvidenceIds);
  const recursivelyFound: string[] = [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const visit = (value: unknown, key = "", depth = 0) => {
    if (depth > 7 || recursivelyFound.length >= 24 || value == null) return;
    if (typeof value === "string" && uuid.test(value) && /(event|evidence)/i.test(key) && allowed.has(value)) recursivelyFound.push(value);
    else if (Array.isArray(value)) value.forEach((item) => visit(item, key, depth + 1));
    else if (typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([k, v]) => visit(v, k, depth + 1));
  };
  visit(input.retrievedData);
  recursivelyFound.forEach((id) => evidence.add(id));

  const suggestions = ["Compare com o período anterior", "O que merece minha atenção agora?", "Quais câmeras tiveram problemas?"].slice(0, 3);
  return AssistantAnswerSchema.parse({
    answer: parts.filter(Boolean).join("\n\n") || "Não encontrei dados suficientes para responder com segurança.",
    caution: cautions.size ? [...cautions].join(" ").slice(0, 600) : null,
    evidenceEventIds: [...evidence].filter((id) => allowed.has(id)).slice(0, 12),
    periodLabel: null,
    suggestions,
  });
}

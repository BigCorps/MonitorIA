import {
  AssistantAnswerSchema,
  AssistantPlanSchema,
  type AssistantAnswer,
  type AssistantDirectory,
  type AssistantHistoryItem,
  type AssistantPlan,
  type AssistantUsage,
} from "./contracts";

export const ZERO_ASSISTANT_USAGE: AssistantUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
};

type DeterministicPlanInput = {
  message: string;
  currentDate: string;
  timezone: string;
  selectedFrom: string | null;
  selectedTo: string | null;
  selectedCameraId: string | null;
  selectedSiteId: string | null;
  directory: AssistantDirectory;
  history: AssistantHistoryItem[];
};

export type DeterministicPlanResult = {
  plan: AssistantPlan;
  confidence: number;
  understood: boolean;
  reason: string;
};

type PeriodResolution = {
  fromDate: string | null;
  toDate: string | null;
  compareFromDate: string | null;
  compareToDate: string | null;
  confidence: number;
};

type EntityResolution = {
  cameraId: string | null;
  siteId: string | null;
  confidence: number;
  ambiguous: boolean;
};

type IntentCode = AssistantPlan["intent"];

type IntentRule = {
  intent: IntentCode;
  score: number;
  patterns: RegExp[];
};

const INTENT_RULES: IntentRule[] = [
  {
    intent: "camera_health",
    score: 1.25,
    patterns: [
      /\bcamer\w*\b.*\b(offline|problema|falh|escura|baixa luz|luminos|emba[cç]ad|desfoc|sem foco|obstru|movid|enquadr|congelad|sa[uú]de|drift)\b/,
      /\b(offline|escura|emba[cç]ad|desfoc|obstru[ií]d|imagem ruim|baixa luminosidade)\b/,
      /\bquais? camer\w*\b.*\bproblema\b/,
    ],
  },
  {
    intent: "cross_camera_sequence",
    score: 1.25,
    patterns: [
      /\b(passagem|trajeto|sequencia|sequ[eê]ncia|percurso)\b.*\b(camera|cameras|entre|para)\b/,
      /\b(de|da|do)\b.+\bpara\b.+\b(passou|passagem|trajeto)\b/,
      /\bmesm[ao]\b.*\b(outra camera|outra c[aâ]mera)\b/,
    ],
  },
  {
    intent: "queue_analysis",
    score: 1.15,
    patterns: [/\b(fila|espera|aguardando|pico de fila)\b/],
  },
  {
    intent: "routine_deviation",
    score: 1.12,
    patterns: [
      /\b(fora do padr[aã]o|fora do normal|desvio|anomali|mudou mais de comportamento|comportamento.*semana)\b/,
      /\b(abriu|abertura|fechou|fechamento)\b.*\b(mais tarde|mais cedo|normal|habitual|esperado|horario|hor[aá]rio)\b/,
      /\b(depois|apos|ap[oó]s)\b.*\b(fechamento|fechar|expediente)\b/,
      /\batividade\b.*\b(fechamento|fora do horario|fora do hor[aá]rio)\b/,
    ],
  },
  {
    intent: "operating_hours",
    score: 1.02,
    patterns: [
      /\b(que horas|horario|hor[aá]rio|quando)\b.*\b(abriu|abertura|fechou|fechamento)\b/,
      /\b(loja|comercio|com[eé]rcio|local)\b.*\b(abriu|fechou)\b/,
      /\b(abertura|fechamento)\b.*\bhoje|ontem|dia\b/,
    ],
  },
  {
    intent: "visual_state",
    score: 1,
    patterns: [
      /\b(estado|aberto|aberta|fechado|fechada|ligado|ligada|desligado|desligada)\b.*\b(porta|portao|port[aã]o|gaveta|armario|arm[aá]rio|equipamento|luz|iluminacao|ilumina[cç][aã]o|caixa)\b/,
      /\b(porta|portao|port[aã]o|gaveta|armario|arm[aá]rio|equipamento)\b.*\b(estado|abriu|fechou|mudou|ligou|desligou)\b/,
    ],
  },
  {
    intent: "equipment_history",
    score: 0.98,
    patterns: [/\b(equipamento|maquina|m[aá]quina|terminal)\b.*\b(hist[oó]ric|mudou|ligou|desligou|funcionou)\b/],
  },
  {
    intent: "object_history",
    score: 0.98,
    patterns: [
      /\b(objeto|caixa|pacote|item)\b.*\b(sumiu|retirad|removid|moveu|movido|apareceu|hist[oó]ric)\b/,
      /\b(remocao|remo[cç][aã]o|retirada)\b.*\b(objeto|item|caixa|pacote)\b/,
    ],
  },
  {
    intent: "vehicle_continuity",
    score: 0.95,
    patterns: [
      /\b(veiculo|ve[ií]culo|carro|moto|caminhao|caminh[aã]o)\b.*\b(distint|mesm|voltou|retornou|permaneceu|permanencia|perman[eê]ncia)\b/,
      /\bquantos?\b.*\b(veiculos|ve[ií]culos|carros|motos)\b/,
    ],
  },
  {
    intent: "continuity_summary",
    score: 0.94,
    patterns: [
      /\b(pessoas?|clientes?)\b.*\b(distint|unicos|[uú]nicos|mesma visita|mesmo atendimento)\b/,
      /\bquantos?\b.*\b(pessoas distintas|clientes distintos)\b/,
    ],
  },
  {
    intent: "staff_activity",
    score: 0.9,
    patterns: [
      /\b(funcionario|funcion[aá]rio|funcionarios|funcion[aá]rios|equipe|staff)\b.*\b(atividade|trabalh|presen[cç]a|padrao|padr[aã]o|rotina)\b/,
      /\bquantos?\b.*\b(funcionario|funcion[aá]rio|funcionarios|funcion[aá]rios)\b/,
    ],
  },
  {
    intent: "interaction_summary",
    score: 0.9,
    patterns: [/\bquantos?\b.*\b(atendimento|atendimentos|entrega|entregas|visita|visitas)\b/],
  },
  {
    intent: "interaction_sessions",
    score: 0.86,
    patterns: [
      /\b(atendimento|entrega|visita|procedimento)\b.*\b(durou|duracao|dura[cç][aã]o|completo|detalhe|resultado)\b/,
      /\b(mostre|liste)\b.*\b(atendimentos|entregas|visitas|sessoes|sess[oõ]es)\b/,
    ],
  },
  {
    intent: "general_help",
    score: 0.82,
    patterns: [
      /\b(o que voce consegue|o que voc[eê] consegue|como usar|como funciona|o que posso perguntar|ajuda)\b/,
    ],
  },
];

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

function dateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateFromOnly(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = dateFromOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnly(date);
}

function startOfWeek(value: string) {
  const date = dateFromOnly(value);
  const weekday = date.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(value, mondayOffset);
}

function startOfMonth(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function previousMonth(value: string) {
  const date = dateFromOnly(startOfMonth(value));
  date.setUTCMonth(date.getUTCMonth() - 1);
  const from = toDateOnly(date);
  const next = dateFromOnly(from);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(next.getUTCDate() - 1);
  return { from, to: toDateOnly(next) };
}

function parseBrazilianDate(value: string, currentDate: string) {
  const match = value.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = match[3] ? Number(match[3]) : Number(currentDate.slice(0, 4));
  if (year < 100) year += 2000;
  const candidate = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return toDateOnly(candidate);
}

function resolvePeriod(
  normalized: string,
  currentDate: string,
  selectedFrom: string | null,
  selectedTo: string | null,
): PeriodResolution {
  if (selectedFrom || selectedTo) {
    return {
      fromDate: selectedFrom ?? selectedTo ?? currentDate,
      toDate: selectedTo ?? selectedFrom ?? currentDate,
      compareFromDate: null,
      compareToDate: null,
      confidence: 1,
    };
  }

  const explicitIso = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (explicitIso && dateOnly(explicitIso[1])) {
    return {
      fromDate: explicitIso[1],
      toDate: explicitIso[1],
      compareFromDate: null,
      compareToDate: null,
      confidence: 0.98,
    };
  }

  const brDate = parseBrazilianDate(normalized, currentDate);
  if (brDate) {
    return {
      fromDate: brDate,
      toDate: brDate,
      compareFromDate: null,
      compareToDate: null,
      confidence: 0.96,
    };
  }

  const lastDays = normalized.match(/\bultim(?:os|as)\s+(\d{1,3})\s+dias?\b/);
  if (lastDays) {
    const days = Math.max(1, Math.min(180, Number(lastDays[1])));
    return {
      fromDate: addDays(currentDate, -(days - 1)),
      toDate: currentDate,
      compareFromDate: null,
      compareToDate: null,
      confidence: 0.96,
    };
  }

  if (/\banteontem\b/.test(normalized)) {
    const value = addDays(currentDate, -2);
    return { fromDate: value, toDate: value, compareFromDate: null, compareToDate: null, confidence: 1 };
  }

  if (/\bontem\b/.test(normalized)) {
    const value = addDays(currentDate, -1);
    return { fromDate: value, toDate: value, compareFromDate: null, compareToDate: null, confidence: 1 };
  }

  if (/\bsemana passada\b/.test(normalized)) {
    const thisMonday = startOfWeek(currentDate);
    return {
      fromDate: addDays(thisMonday, -7),
      toDate: addDays(thisMonday, -1),
      compareFromDate: null,
      compareToDate: null,
      confidence: 1,
    };
  }

  if (/\b(esta|essa) semana\b/.test(normalized)) {
    return {
      fromDate: startOfWeek(currentDate),
      toDate: currentDate,
      compareFromDate: null,
      compareToDate: null,
      confidence: 1,
    };
  }

  if (/\bmes passado\b/.test(normalized)) {
    const previous = previousMonth(currentDate);
    return {
      fromDate: previous.from,
      toDate: previous.to,
      compareFromDate: null,
      compareToDate: null,
      confidence: 1,
    };
  }

  if (/\b(este|esse) mes\b/.test(normalized)) {
    return {
      fromDate: startOfMonth(currentDate),
      toDate: currentDate,
      compareFromDate: null,
      compareToDate: null,
      confidence: 1,
    };
  }

  return {
    fromDate: currentDate,
    toDate: currentDate,
    compareFromDate: null,
    compareToDate: null,
    confidence: 0.72,
  };
}

function previousComparablePeriod(fromDate: string, toDate: string) {
  const from = dateFromOnly(fromDate);
  const to = dateFromOnly(toDate);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const compareTo = addDays(fromDate, -1);
  return {
    compareFromDate: addDays(compareTo, -(days - 1)),
    compareToDate: compareTo,
  };
}

function resolveComparison(normalized: string, period: PeriodResolution) {
  if (!/\b(compare|comparar|comparacao|comparar com|versus|vs\.?|em relacao a)\b/.test(normalized)) {
    return period;
  }

  const fromDate = period.fromDate ?? "";
  const toDate = period.toDate ?? fromDate;
  if (!dateOnly(fromDate) || !dateOnly(toDate)) return period;

  if (/\bsemana(?:\s+\w+){0,3}\s+anterior\b/.test(normalized) || /\bsemana passada\b/.test(normalized)) {
    const monday = startOfWeek(fromDate);
    return {
      ...period,
      compareFromDate: addDays(monday, -7),
      compareToDate: addDays(monday, -1),
    };
  }

  return {
    ...period,
    ...previousComparablePeriod(fromDate, toDate),
  };
}

function resolveEntity(
  normalized: string,
  directory: AssistantDirectory,
  selectedCameraId: string | null,
  selectedSiteId: string | null,
): EntityResolution {
  if (selectedCameraId || selectedSiteId) {
    return {
      cameraId: selectedCameraId,
      siteId: selectedSiteId,
      confidence: 1,
      ambiguous: false,
    };
  }

  const cameraMatches = directory.cameras
    .map((camera) => {
      const name = normalize(camera.name);
      const exact = name && normalized.includes(name);
      const tokens = name.split(" ").filter((token) => token.length >= 3);
      const matchedTokens = tokens.filter((token) => normalized.includes(token)).length;
      const score = exact ? 1 : tokens.length ? matchedTokens / tokens.length : 0;
      return { camera, score };
    })
    .filter((item) => item.score >= 0.6)
    .sort((left, right) => right.score - left.score);

  const bestCamera = cameraMatches[0];
  const cameraAmbiguous = Boolean(
    bestCamera && cameraMatches[1] && Math.abs(bestCamera.score - cameraMatches[1].score) < 0.08,
  );

  if (bestCamera && !cameraAmbiguous) {
    return {
      cameraId: bestCamera.camera.id,
      siteId: bestCamera.camera.siteId,
      confidence: bestCamera.score,
      ambiguous: false,
    };
  }

  const siteMatches = directory.sites
    .map((site) => {
      const name = normalize(site.name);
      const exact = name && normalized.includes(name);
      const tokens = name.split(" ").filter((token) => token.length >= 3);
      const matchedTokens = tokens.filter((token) => normalized.includes(token)).length;
      const score = exact ? 1 : tokens.length ? matchedTokens / tokens.length : 0;
      return { site, score };
    })
    .filter((item) => item.score >= 0.65)
    .sort((left, right) => right.score - left.score);

  const bestSite = siteMatches[0];
  const siteAmbiguous = Boolean(
    bestSite && siteMatches[1] && Math.abs(bestSite.score - siteMatches[1].score) < 0.08,
  );

  return {
    cameraId: null,
    siteId: bestSite && !siteAmbiguous ? bestSite.site.id : null,
    confidence: bestSite && !siteAmbiguous ? bestSite.score : cameraAmbiguous || siteAmbiguous ? 0.35 : 0.72,
    ambiguous: cameraAmbiguous || siteAmbiguous,
  };
}

function scoreIntent(normalized: string) {
  const scores = new Map<IntentCode, number>();

  for (const rule of INTENT_RULES) {
    let score = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(normalized)) score += rule.score;
    }
    if (score > 0) scores.set(rule.intent, score);
  }

  if (/\b(compare|comparar|comparacao|versus|vs\.?|em relacao a)\b/.test(normalized)) {
    scores.set("compare_periods", 2.4);
  }

  if (/\b(o que aconteceu|resumo do dia|resuma o dia|como foi o dia|aconteceu hoje)\b/.test(normalized)) {
    scores.set("daily_operations", 2.1);
  }

  if (/\b(mostre|liste|listar|encontre|encontrar)\b.*\b(evento|eventos|acontecimento|acontecimentos)\b/.test(normalized)) {
    scores.set("search_events", Math.max(scores.get("search_events") ?? 0, 1.6));
  }

  if (/\b(importante|importantes|relevante|relevantes)\b/.test(normalized) && /\b(evento|eventos|acontecimento|acontecimentos)\b/.test(normalized)) {
    scores.set("search_events", 2.2);
  }

  if (/\bqual\b.*\bcamera\b.*\b(mais|maior)\b.*\b(eventos|movimento|atividade)\b/.test(normalized)) {
    scores.set("period_summary", 2.2);
  }

  if (/\b(quantos|quantas|total|media|m[eé]dia|mais movimento|mais eventos|pico|horario mais|hor[aá]rio mais)\b/.test(normalized)) {
    scores.set("period_summary", Math.max(scores.get("period_summary") ?? 0, 1.15));
  }

  if (/\b(clientes?|entregas?|veiculos?|ve[ií]culos|funcionarios?|funcion[aá]rios|movimento|atividade|eventos?)\b/.test(normalized)) {
    scores.set("period_summary", Math.max(scores.get("period_summary") ?? 0, 0.8));
  }

  const ordered = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  const [best, second] = ordered;
  return {
    intent: best?.[0] ?? "period_summary",
    score: best?.[1] ?? 0.42,
    margin: best ? best[1] - (second?.[1] ?? 0) : 0,
  };
}

function parseClock(value: string) {
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function resolveTimeDirective(normalized: string) {
  const match = normalized.match(
    /\b(?:entre|das?|de)\s+(\d{1,2}(?::\d{2})?)\s*h?\s*(?:e|a|ate|-)\s*(\d{1,2}(?::\d{2})?)\s*h?\b/,
  );
  if (!match) return null;
  const from = parseClock(match[1]);
  const to = parseClock(match[2]);
  if (!from || !to || from === to) return null;
  return `@time=${from}-${to}`;
}

function queryTerms(normalized: string, directory: AssistantDirectory) {
  const entityTokens = new Set(
    [...directory.cameras.map((item) => item.name), ...directory.sites.map((item) => item.name)]
      .flatMap((name) => normalize(name).split(" "))
      .filter((token) => token.length >= 3),
  );
  const specificTerms = [
    "pacote",
    "entrega",
    "entregador",
    "objeto",
    "veiculo",
    "carro",
    "moto",
    "pessoa",
    "cliente",
    "funcionario",
    "fila",
    "intrusao",
    "entrada",
    "saida",
    "portao",
    "armario",
    "equipamento",
  ].filter((term) => normalized.includes(term) && !entityTokens.has(term));

  return [...new Set(specificTerms)].slice(0, 4).join(" ");
}

function buildQuery(normalized: string, intent: IntentCode, directory: AssistantDirectory) {
  const directives: string[] = [];
  const timeDirective = resolveTimeDirective(normalized);
  if (timeDirective) directives.push(timeDirective);
  if (/\b(importante|importantes|relevante|relevantes)\b/.test(normalized)) directives.push("@important");

  const searchIntents = new Set<IntentCode>(["search_events", "object_history", "equipment_history", "period_summary"]);
  const terms = searchIntents.has(intent) ? queryTerms(normalized, directory) : "";
  return [...directives, terms].filter(Boolean).join(" ").trim().slice(0, 240);
}

function chartPreferences(normalized: string): Pick<AssistantPlan, "wantsChart" | "chartType" | "chartMetric"> {
  const wantsChart = /\b(grafico|gr[aá]fico|visualizacao|visualiza[cç][aã]o|linha|barras?|chart)\b/.test(normalized);
  if (!wantsChart) return { wantsChart: false, chartType: null, chartMetric: null };

  let chartMetric: AssistantPlan["chartMetric"] = "summary_metrics";
  if (/\b(hora|horario|hor[aá]rio|movimento)\b/.test(normalized)) chartMetric = "events_by_hour";
  else if (/\b(cliente|funcionario|funcion[aá]rio|papel|pessoas)\b/.test(normalized)) chartMetric = "roles";
  else if (/\b(tipo|categoria|evento)\b/.test(normalized)) chartMetric = "event_types";

  return {
    wantsChart: true,
    chartType: /\b(linha|evolucao|evolu[cç][aã]o|hora|horario|hor[aá]rio)\b/.test(normalized) ? "line" : "bar",
    chartMetric,
  };
}

function lastUserMessage(history: AssistantHistoryItem[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === "user") return history[index]?.content ?? null;
  }
  return null;
}

function isElliptical(normalized: string) {
  return (
    normalized.length <= 55 &&
    (/^e\b/.test(normalized) || /^(ontem|anteontem|semana passada|no|na|s[oó]|apenas)\b/.test(normalized))
  );
}

function usesCurrentOnlyCapability(intent: IntentCode) {
  return intent === "camera_health" || intent === "cross_camera_sequence";
}

function resolveLocalRecordingConstraint(plan: AssistantPlan, directory: AssistantDirectory) {
  if (!plan.cameraId || !usesCurrentOnlyCapability(plan.intent)) return plan;
  const camera = directory.cameras.find((item) => item.id === plan.cameraId);
  if (!camera || camera.sourceKind === "live_camera") return plan;

  return AssistantPlanSchema.parse({
    ...plan,
    intent: "period_summary",
    query: "",
  });
}

function planInternal(input: DeterministicPlanInput, allowHistory: boolean): DeterministicPlanResult {
  const normalized = normalize(input.message);
  const entity = resolveEntity(
    normalized,
    input.directory,
    input.selectedCameraId,
    input.selectedSiteId,
  );
  let period = resolvePeriod(normalized, input.currentDate, input.selectedFrom, input.selectedTo);
  const scored = scoreIntent(normalized);
  let intent = scored.intent;
  let inheritedConfidence = 1;

  if (allowHistory && isElliptical(normalized)) {
    const previous = lastUserMessage(input.history);
    if (previous) {
      const inherited = planInternal(
        {
          ...input,
          message: previous,
          selectedFrom: null,
          selectedTo: null,
          selectedCameraId: null,
          selectedSiteId: null,
          history: [],
        },
        false,
      );
      if (inherited.understood) {
        intent = inherited.plan.intent;
        inheritedConfidence = inherited.confidence;
        if (!/(hoje|ontem|anteontem|semana|mes|\d{1,2}\/\d{1,2}|20\d{2}-)/.test(normalized)) {
          period = {
            ...period,
            fromDate: inherited.plan.fromDate,
            toDate: inherited.plan.toDate,
            compareFromDate: inherited.plan.compareFromDate,
            compareToDate: inherited.plan.compareToDate,
          };
        }
      }
    }
  }

  period = resolveComparison(normalized, period);
  if (/\b(compare|comparar|comparacao|versus|vs\.?|em relacao a)\b/.test(normalized)) {
    intent = "compare_periods";
  }

  if (resolveTimeDirective(normalized)) intent = "search_events";

  const chart = chartPreferences(normalized);
  const basePlan = AssistantPlanSchema.parse({
    intent,
    query: buildQuery(normalized, intent, input.directory),
    fromDate: period.fromDate,
    toDate: period.toDate,
    compareFromDate: period.compareFromDate,
    compareToDate: period.compareToDate,
    cameraId: entity.cameraId,
    siteId: entity.siteId,
    evidenceLimit: /\b(mostre|liste|eventos|acontecimentos)\b/.test(normalized) ? 8 : 6,
    ...chart,
  });

  const plan = resolveLocalRecordingConstraint(basePlan, input.directory);
  const ambiguityPenalty = entity.ambiguous ? 0.38 : 0;
  const scoreConfidence = Math.min(0.99, 0.5 + scored.score / 3 + Math.min(0.2, scored.margin / 4));
  const confidence = Math.max(
    0.1,
    Math.min(
      scoreConfidence,
      entity.confidence,
      period.confidence,
      inheritedConfidence,
    ) - ambiguityPenalty,
  );

  const genericButSafe = plan.intent === "period_summary" && /\b(evento|movimento|atividade|cliente|entrega|veiculo|funcionario)\b/.test(normalized);
  const understood = confidence >= 0.72 && (scored.score >= 0.75 || genericButSafe || isElliptical(normalized));

  return {
    plan,
    confidence,
    understood,
    reason: entity.ambiguous
      ? "entity_ambiguous"
      : understood
        ? "deterministic_match"
        : "low_intent_confidence",
  };
}

export function planDeterministically(input: DeterministicPlanInput): DeterministicPlanResult {
  return planInternal(input, true);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}

function ptNumber(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(value);
}

function formatTime(value: unknown) {
  const text = String(value ?? "");
  const localized = text.match(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/);
  if (localized) return localized[0];

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function firstAllowed(ids: unknown[], allowedEvidenceIds: string[], limit = 4) {
  const allowed = new Set(allowedEvidenceIds);
  return [...new Set(ids.map(String).filter((id) => allowed.has(id)))].slice(0, limit);
}

function evidenceFromUnknown(value: unknown, allowedEvidenceIds: string[], limit = 4) {
  const found: string[] = [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function visit(current: unknown, key = "", depth = 0) {
    if (depth > 7 || found.length >= 24 || current == null) return;
    if (typeof current === "string") {
      if (uuid.test(current) && /(evidence|event)/i.test(key) && !found.includes(current)) found.push(current);
      return;
    }
    if (Array.isArray(current)) {
      for (const item of current) visit(item, key, depth + 1);
      return;
    }
    if (typeof current === "object") {
      for (const [childKey, child] of Object.entries(current)) visit(child, childKey, depth + 1);
    }
  }
  visit(value);
  return firstAllowed(found, allowedEvidenceIds, limit);
}

function healthIssueFilter(normalized: string) {
  if (/\b(offline|sem observacao|sem observa[cç][aã]o|desconect)\b/.test(normalized)) return "no_recent_observation";
  if (/\b(escura|baixa luz|luminos)\b/.test(normalized)) return "low_light";
  if (/\b(emba[cç]ad|desfoc|sem foco)\b/.test(normalized)) return "blurry";
  if (/\b(obstru|tapada|coberta)\b/.test(normalized)) return "lens_obstructed";
  if (/\b(movid|enquadr|drift)\b/.test(normalized)) return "frame_shifted";
  if (/\b(congelad|travada)\b/.test(normalized)) return "possible_frame_freeze";
  return null;
}

function answerCameraHealth(message: string, data: Record<string, unknown>) {
  const health = objectValue(data.cameraHealth);
  const summary = objectValue(health.summary);
  const cameras = arrayValue(health.cameras).map(objectValue);
  const issue = healthIssueFilter(normalize(message));
  const relevant = cameras.filter((camera) => {
    const incidents = arrayValue(camera.active_incidents).map(objectValue);
    if (issue === "frame_shifted") {
      return incidents.some((incident) => ["frame_shifted", "profile_drift"].includes(stringValue(incident.type)));
    }
    return issue ? incidents.some((incident) => stringValue(incident.type) === issue) : incidents.length > 0 || ["degraded", "critical", "offline"].includes(stringValue(camera.health_status));
  });

  if (!relevant.length) {
    const enabled = numberValue(summary.cameras_enabled);
    return {
      answer: enabled
        ? `Não há incidente ativo compatível com essa pergunta entre as ${enabled} câmeras com monitoramento de saúde habilitado.`
        : "Não há câmeras com monitoramento de saúde habilitado para responder com segurança.",
      caution: enabled ? null : "Ausência de monitoramento de saúde não significa que a imagem esteja normal.",
    };
  }

  const details = relevant.slice(0, 4).map((camera) => {
    const incidents = arrayValue(camera.active_incidents).map(objectValue).filter((incident) => {
      if (!issue) return true;
      if (issue === "frame_shifted") return ["frame_shifted", "profile_drift"].includes(stringValue(incident.type));
      return stringValue(incident.type) === issue;
    });
    const latest = incidents[0] ?? objectValue({});
    const last = formatTime(latest.last_observed_at ?? camera.last_observed_at);
    const consecutive = numberValue(latest.consecutive_count);
    const summaryText = stringValue(latest.summary);
    return `${stringValue(camera.camera_name) || "Câmera"}: ${summaryText || stringValue(camera.health_status)}${consecutive > 1 ? ` (${consecutive} observações consecutivas)` : ""}${last ? `, última observação às ${last}` : ""}.`;
  });

  return {
    answer: `${relevant.length === 1 ? "Foi encontrada 1 câmera" : `Foram encontradas ${relevant.length} câmeras`} com sinal compatível.\n${details.join("\n")}`,
    caution: "Incidentes de saúde descrevem qualidade, conexão ou enquadramento da câmera; não determinam a causa nem intenção de alguém.",
  };
}

function deviationMatchesQuestion(code: string, normalized: string) {
  if (/\b(depois|apos|ap[oó]s).*\b(fechamento|expediente)\b/.test(normalized)) return code === "activity_after_closing";
  if (/\babriu.*(tarde|atras)|abertura.*(tarde|atras)\b/.test(normalized)) return code === "opening_late" || code === "opening_not_observed";
  if (/\babriu.*cedo|abertura.*cedo\b/.test(normalized)) return code === "opening_early";
  if (/\bfech.*tarde\b/.test(normalized)) return code === "closing_late" || code === "closing_not_observed";
  if (/\bfech.*cedo\b/.test(normalized)) return code === "closing_early";
  return true;
}

function answerRoutine(message: string, data: Record<string, unknown>) {
  const routine = objectValue(data.routineDeviation);
  const normalized = normalize(message);
  const deviations = arrayValue(routine.deviations).map(objectValue).filter((row) => deviationMatchesQuestion(stringValue(row.deviation_code), normalized));

  if (/\bqual\b.*\bcamera\b.*\b(mudou|desvio|comportamento)\b/.test(normalized)) {
    const ranking = new Map<string, { count: number; severity: number; name: string }>();
    const severityWeight: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
    for (const row of deviations) {
      const id = stringValue(row.camera_id);
      if (!id) continue;
      const current = ranking.get(id) ?? { count: 0, severity: 0, name: stringValue(row.camera_name) || id.slice(0, 8) };
      current.count += 1;
      current.severity += severityWeight[stringValue(row.severity)] ?? 0;
      ranking.set(id, current);
    }
    const top = [...ranking.values()].sort((a, b) => b.severity - a.severity || b.count - a.count)[0];
    if (top) {
      return {
        answer: `${top.name} concentrou mais diferenças registradas no período: ${top.count} desvio${top.count === 1 ? "" : "s"} em relação ao padrão/expectativa disponível.`,
        caution: "Esse resultado mede diferenças estatísticas registradas; não indica comportamento suspeito, culpa ou intenção.",
      };
    }
  }

  if (!deviations.length) {
    return {
      answer: "Não há desvio registrado compatível com essa pergunta no período consultado.",
      caution: "Ausência de desvio registrado não prova que uma atividade não ocorreu; depende da cobertura e das observações disponíveis.",
    };
  }

  const first = deviations[0];
  const observed = first.observed_value == null ? null : numberValue(first.observed_value);
  const lower = first.expected_lower == null ? null : numberValue(first.expected_lower);
  const upper = first.expected_upper == null ? null : numberValue(first.expected_upper);
  const base = stringValue(first.summary) || stringValue(first.title);
  const evidenceText = observed !== null && lower !== null && upper !== null
    ? ` Valor observado: ${ptNumber(observed)}; faixa de referência: ${ptNumber(lower)} a ${ptNumber(upper)} ${stringValue(first.unit)}.`
    : "";
  return {
    answer: `${base}${evidenceText}`.trim(),
    caution: "Um desvio apenas indica diferença em relação ao horário informado ou padrão aprendido; não prova causa, intenção ou falha operacional.",
  };
}

function answerOperatingHours(data: Record<string, unknown>, message: string) {
  const hours = objectValue(data.operatingHours);
  const sessions = arrayValue(hours.sessions).map(objectValue);
  if (!sessions.length) {
    return {
      answer: "Não há uma sessão de abertura/fechamento com evidência suficiente no período consultado.",
      caution: "Ausência de confirmação visual não prova que o local não abriu ou não fechou.",
    };
  }

  const session = sessions[sessions.length - 1] ?? sessions[0];
  const normalized = normalize(message);
  const asksOpen = /\b(abriu|abertura|abrir)\b/.test(normalized);
  const asksClose = /\b(fechou|fechamento|fechar)\b/.test(normalized);
  const parts: string[] = [];

  if (asksOpen || !asksClose) {
    const precision = stringValue(session.openingPrecision);
    const openedAt = session.openedAt ?? session.firstOpenObservedAt;
    const time = formatTime(openedAt);
    if (time) {
      if (precision === "observed_only") parts.push(`Às ${time}, o local já aparecia aberto; esse horário não é uma confirmação exata da transição de abertura.`);
      else if (precision === "estimated_interval") parts.push(`A abertura foi estimada em torno de ${time}, dentro de uma faixa observada.`);
      else parts.push(`A abertura foi observada por volta de ${time}.`);
    }
  }

  if (asksClose || !asksOpen) {
    const precision = stringValue(session.closingPrecision);
    const time = formatTime(session.closedAt);
    if (time) {
      if (precision === "estimated_interval") parts.push(`O fechamento foi estimado em torno de ${time}, dentro de uma faixa observada.`);
      else parts.push(`O fechamento foi observado por volta de ${time}.`);
    } else {
      parts.push("O fechamento não foi confirmado no período consultado.");
    }
  }

  return {
    answer: parts.join(" ") || "Há dados operacionais no período, mas não um horário confiável para responder exatamente.",
    caution: "Horários aproximados e estados já observados são diferentes de uma transição visual diretamente capturada.",
  };
}

function answerSearch(message: string, data: Record<string, unknown>) {
  const total = numberValue(data.totalFound);
  const events = arrayValue(data.events).map(objectValue);
  if (!total) {
    return {
      answer: "Não encontrei eventos compatíveis com esses filtros no período consultado.",
      caution: "Isso significa zero resultados nos registros disponíveis, não prova que nada aconteceu fora da cobertura das câmeras.",
    };
  }
  const details = events.slice(0, 3).map((event) => {
    const time = formatTime(event.startedAt);
    return `${time ? `${time} · ` : ""}${stringValue(event.cameraName)} · ${stringValue(event.headline) || stringValue(event.summary)}`;
  });
  const normalized = normalize(message);
  const prefix = /\bquantos?\b/.test(normalized)
    ? `Foram encontrados ${total} evento${total === 1 ? "" : "s"} compatíveis.`
    : `${total} evento${total === 1 ? "" : "s"} corresponde${total === 1 ? "" : "m"} à pesquisa.`;
  return {
    answer: `${prefix}${details.length ? `\n${details.join("\n")}` : ""}`,
    caution: null,
  };
}

function topCamera(summary: Record<string, unknown>) {
  const rows = arrayValue(summary.byCamera).map(objectValue).sort((a, b) => numberValue(b.events) - numberValue(a.events));
  return rows[0] ?? null;
}

function metricForMessage(normalized: string, summary: Record<string, unknown>, calibrated: Record<string, unknown>) {
  if (/\bclientes?\b/.test(normalized)) {
    const calibratedValue = numberValue(calibrated.qualifiedCustomerVisits);
    if (calibratedValue > 0 || "qualifiedCustomerVisits" in calibrated) return { label: "visitas/atendimentos de clientes prováveis", value: calibratedValue, estimated: true };
    return { label: "aparições classificadas como cliente", value: numberValue(summary.customerAppearances), estimated: true };
  }
  if (/\bfuncionarios?|funcion[aá]rios|equipe\b/.test(normalized)) {
    const calibratedValue = numberValue(calibrated.probableDistinctStaff);
    if (calibratedValue > 0 || "probableDistinctStaff" in calibrated) return { label: "funcionários distintos prováveis", value: calibratedValue, estimated: true };
    return { label: "aparições classificadas como funcionário", value: numberValue(summary.staffAppearances), estimated: true };
  }
  if (/\bentregas?|pacotes?\b/.test(normalized)) return { label: "eventos relacionados a entregas", value: numberValue(summary.deliveryRelatedEvents), estimated: false };
  if (/\bveiculos?|ve[ií]culos|carros?|motos?\b/.test(normalized)) {
    const calibratedValue = numberValue(calibrated.probableDistinctParkedVehicles);
    if (calibratedValue > 0 || "probableDistinctParkedVehicles" in calibrated) return { label: "veículos distintos prováveis", value: calibratedValue, estimated: true };
    return { label: "eventos com veículos", value: numberValue(summary.vehicleEvents), estimated: false };
  }
  if (/\bobjetos?|itens?\b/.test(normalized)) return { label: "eventos com mudança de objeto", value: numberValue(summary.objectChangeEvents), estimated: false };
  return { label: "eventos", value: numberValue(summary.totalEvents), estimated: false };
}

function answerPeriod(message: string, data: Record<string, unknown>) {
  const summary = objectValue(data.summary ?? data.periodSummary);
  const calibrated = objectValue(data.calibratedActivity);
  const normalized = normalize(message);
  const total = numberValue(summary.totalEvents);

  if (/\bqual\b.*\bcamera\b.*\b(mais|maior)\b.*\b(eventos|movimento|atividade)\b/.test(normalized)) {
    const top = topCamera(summary);
    if (top) {
      return {
        answer: `${stringValue(top.cameraName) || "A câmera com maior contagem"} registrou mais eventos no período: ${numberValue(top.events)} de ${total} eventos considerados.`,
        caution: "Aqui, “movimento” é medido pela quantidade de eventos registrados, não por uma contagem física contínua de movimento.",
      };
    }
  }

  if (/\b(horario|hor[aá]rio|hora)\b.*\b(mais|maior|pico)\b/.test(normalized)) {
    const byHour = arrayValue(summary.byHour).map(objectValue).sort((a, b) => numberValue(b.events) - numberValue(a.events));
    const peak = byHour[0];
    if (peak) {
      const hour = String(numberValue(peak.hour)).padStart(2, "0");
      return { answer: `O maior volume registrado ocorreu por volta das ${hour}h, com ${numberValue(peak.events)} eventos.`, caution: null };
    }
  }

  const metric = metricForMessage(normalized, summary, calibrated);
  if (/\bquantos?|quantas|total\b/.test(normalized)) {
    return {
      answer: `${metric.estimated ? "Foram estimados" : "Foram registrados"} ${metric.value} ${metric.label} no período consultado.`,
      caution: metric.estimated ? "Métricas de pessoas e continuidade são estimativas visuais e não representam identificação civil." : null,
    };
  }

  const cameraCount = arrayValue(summary.byCamera).length;
  const evidenceCount = arrayValue(summary.evidence).length;
  const details = [
    `${total} eventos registrados${cameraCount ? ` por ${cameraCount} câmera${cameraCount === 1 ? "" : "s"}` : ""}.`,
    numberValue(calibrated.qualifiedCustomerVisits) ? `${numberValue(calibrated.qualifiedCustomerVisits)} visitas/atendimentos de clientes prováveis.` : null,
    numberValue(summary.deliveryRelatedEvents) ? `${numberValue(summary.deliveryRelatedEvents)} eventos relacionados a entregas.` : null,
  ].filter(Boolean);
  return {
    answer: `${details.join(" ")}${evidenceCount ? ` A resposta usa até ${evidenceCount} eventos recentes como evidência.` : ""}`,
    caution: null,
  };
}

function answerComparison(message: string, data: Record<string, unknown>) {
  const a = objectValue(data.periodA);
  const b = objectValue(data.periodB);
  const summaryA = objectValue(a.summary);
  const summaryB = objectValue(b.summary);
  const normalized = normalize(message);
  const metricA = metricForMessage(normalized, summaryA, objectValue({}));
  const metricB = metricForMessage(normalized, summaryB, objectValue({}));
  const delta = metricA.value - metricB.value;
  const change = metricB.value !== 0 ? (delta / metricB.value) * 100 : null;
  const direction = delta === 0 ? "sem diferença" : delta > 0 ? `${Math.abs(delta)} a mais` : `${Math.abs(delta)} a menos`;
  const pct = change == null ? "" : ` (${change >= 0 ? "+" : ""}${ptNumber(change)}%)`;
  return {
    answer: `No período atual foram registrados ${metricA.value} ${metricA.label}; no período de comparação, ${metricB.value}. Diferença: ${direction}${pct}.`,
    caution: metricA.estimated || metricB.estimated ? "A comparação usa estimativas visuais quando envolve pessoas/continuidade." : null,
  };
}

function answerCrossCamera(data: Record<string, unknown>) {
  const summary = objectValue(data.crossCameraSequence);
  const total = numberValue(summary.total);
  if (!total) return { answer: "Não há passagem provável entre câmeras registrada no período consultado.", caution: "A ausência de uma sequência não prova que não houve deslocamento entre áreas." };
  return {
    answer: `Foram registradas ${total} passagem${total === 1 ? " provável" : "ens prováveis"} entre câmeras no período, envolvendo ${numberValue(summary.people)} hipótese${numberValue(summary.people) === 1 ? "" : "s"} de pessoa e ${numberValue(summary.vehicles)} de veículo.`,
    caution: "Essas sequências são hipóteses por tempo e características visíveis; não confirmam identidade, rosto ou placa.",
  };
}

function answerContinuity(data: Record<string, unknown>) {
  const value = objectValue(data.continuity);
  return {
    answer: `A estimativa aponta ${numberValue(value.probableDistinctPeople)} pessoas distintas prováveis no período, incluindo ${numberValue(value.probableCustomers)} clientes prováveis e ${numberValue(value.probableStaffInstances)} instâncias prováveis de equipe.`,
    caution: "As estimativas usam continuidade temporal e aparência ampla, sem reconhecimento facial ou identidade civil.",
  };
}

function answerVehicles(data: Record<string, unknown>) {
  const value = objectValue(data.vehicleContinuity);
  return {
    answer: `Foram estimados ${numberValue(value.probableDistinctVehicles)} veículos distintos prováveis a partir de ${numberValue(value.rawVehicleObservations)} observações de veículos.`,
    caution: "A continuidade de veículos usa características visíveis e proximidade temporal; não confirma placa, proprietário ou modelo exato.",
  };
}

function answerVisualState(data: Record<string, unknown>) {
  const value = objectValue(data.visualStates ?? data.visualStateHistory);
  const transitions = arrayValue(value.transitions).map(objectValue);
  const current = arrayValue(value.currentStates).map(objectValue);
  if (transitions.length) {
    const last = transitions[0];
    return {
      answer: `${stringValue(last.entityName) || "A entidade monitorada"} mudou de ${stringValue(last.fromState)} para ${stringValue(last.toState)}${formatTime(last.occurredAt) ? ` às ${formatTime(last.occurredAt)}` : ""}.`,
      caution: last.afterConfirmedClosing === true ? "A transição ocorreu após um fechamento visual confirmado; isso não determina motivo ou autorização." : null,
    };
  }
  if (current.length) {
    const first = current[0];
    return { answer: `${stringValue(first.entityName) || "A entidade monitorada"} está no estado visual “${stringValue(first.state)}” na última observação disponível.`, caution: null };
  }
  return { answer: "Não há estado visual suficiente para responder essa pergunta no período consultado.", caution: "Ausência de observação não prova o estado físico fora da cobertura da câmera." };
}

function answerInteractions(data: Record<string, unknown>) {
  const sessions = objectValue(data.operationalSessions);
  const rows = arrayValue(sessions.sessions).map(objectValue);
  const total = numberValue(sessions.total ?? sessions.count ?? rows.length);
  if (!total && !rows.length) return { answer: "Não há períodos de atendimento/visita consolidados compatíveis com a pergunta.", caution: null };
  const details = rows.slice(0, 3).map((row) => stringValue(row.summary)).filter(Boolean);
  return {
    answer: `${total || rows.length} período${(total || rows.length) === 1 ? "" : "s"} operacional${(total || rows.length) === 1 ? " foi" : " foram"} encontrado${(total || rows.length) === 1 ? "" : "s"}.${details.length ? ` ${details.join(" ")}` : ""}`,
    caution: "Resultados visuais não confirmam venda, pagamento ou intenção.",
  };
}

function answerDaily(data: Record<string, unknown>) {
  const summary = objectValue(data.periodSummary);
  const health = objectValue(objectValue(data.cameraHealth).summary);
  const routine = objectValue(data.routineDeviation);
  const deviations = arrayValue(routine.deviations);
  const sessions = objectValue(data.operationalSessions);
  const sessionRows = arrayValue(sessions.sessions);
  const lines = [
    `${numberValue(summary.totalEvents)} eventos foram registrados no período.`,
    sessionRows.length ? `${sessionRows.length} períodos de atividade/atendimento foram consolidados.` : null,
    deviations.length ? `${deviations.length} diferença${deviations.length === 1 ? "" : "s"} em relação à rotina/expectativa foi${deviations.length === 1 ? "" : "ram"} registrada${deviations.length === 1 ? "" : "s"}.` : "Nenhum desvio operacional foi registrado no período.",
    numberValue(health.active_incidents) ? `${numberValue(health.active_incidents)} incidente${numberValue(health.active_incidents) === 1 ? "" : "s"} de saúde de câmera está${numberValue(health.active_incidents) === 1 ? "" : "o"} ativo${numberValue(health.active_incidents) === 1 ? "" : "s"}.` : "Não há incidente ativo de saúde de câmera no resumo atual.",
  ].filter(Boolean);
  return { answer: lines.join("\n"), caution: "Desvios e inferências descrevem diferenças observadas; não atribuem intenção, culpa ou identidade." };
}

function answerGeneralHelp() {
  return {
    answer: "Você pode perguntar sobre eventos, horários de abertura/fechamento, atividade após o horário, saúde das câmeras, rotinas e desvios, atendimentos, filas, objetos, veículos, estados visuais, passagens prováveis entre câmeras e comparações de períodos. A Pesquisa IA usa primeiro os dados estruturados já produzidos pela MonitorIA.",
    caution: "Quando os dados não sustentarem uma conclusão, a resposta indicará ausência de evidência em vez de inventar uma explicação.",
  };
}

export function answerDeterministically(input: {
  message: string;
  plan: AssistantPlan;
  retrievedData: unknown;
  allowedEvidenceIds: string[];
}): AssistantAnswer {
  const data = objectValue(input.retrievedData);
  let result: { answer: string; caution: string | null };

  switch (input.plan.intent) {
    case "camera_health":
      result = answerCameraHealth(input.message, data);
      break;
    case "routine_deviation":
      result = answerRoutine(input.message, data);
      break;
    case "operating_hours":
      result = answerOperatingHours(data, input.message);
      break;
    case "search_events":
      result = answerSearch(input.message, data);
      break;
    case "period_summary":
      result = answerPeriod(input.message, data);
      break;
    case "compare_periods":
      result = answerComparison(input.message, data);
      break;
    case "daily_operations":
      result = answerDaily(data);
      break;
    case "cross_camera_sequence":
      result = answerCrossCamera(data);
      break;
    case "continuity_summary":
      result = answerContinuity(data);
      break;
    case "vehicle_continuity":
      result = answerVehicles(data);
      break;
    case "visual_state":
    case "object_history":
    case "equipment_history":
      result = answerVisualState(data);
      break;
    case "interaction_sessions":
    case "interaction_summary":
      result = answerInteractions(data);
      break;
    case "queue_analysis": {
      const queue = objectValue(data.queueAnalysis);
      result = {
        answer: stringValue(queue.summary) || `A análise de fila encontrou ${numberValue(queue.total ?? queue.count)} registro${numberValue(queue.total ?? queue.count) === 1 ? "" : "s"} compatível${numberValue(queue.total ?? queue.count) === 1 ? "" : "s"}.`,
        caution: "Tempo de espera e quantidade de pessoas são aproximados quando os sinais visuais não permitem medir cada indivíduo continuamente.",
      };
      break;
    }
    case "staff_activity": {
      const profiles = objectValue(data.staffOperationalProfiles);
      const patterns = arrayValue(profiles.patterns).map(objectValue);
      const calibrated = objectValue(data.calibratedActivity);
      result = {
        answer: `Foram estimados ${numberValue(calibrated.probableDistinctStaff)} funcionários distintos prováveis no período. ${patterns.length ? `${patterns.length} padrão${patterns.length === 1 ? " operacional aprovado está" : "ões operacionais aprovados estão"} disponível${patterns.length === 1 ? "" : "s"} para contexto.` : ""}`.trim(),
        caution: "Perfis de equipe são padrões operacionais aprovados; não usam reconhecimento facial nem identidade civil.",
      };
      break;
    }
    default:
      result = answerGeneralHelp();
      break;
  }

  const evidenceEventIds = evidenceFromUnknown(input.retrievedData, input.allowedEvidenceIds, 4);
  const suggestions: string[] = [];
  if (input.plan.intent !== "compare_periods") suggestions.push("Compare com o período anterior");
  if (input.plan.intent !== "camera_health") suggestions.push("Quais câmeras estão com problema agora?");
  if (input.plan.intent !== "daily_operations") suggestions.push("O que aconteceu hoje?");

  return AssistantAnswerSchema.parse({
    answer: result.answer,
    caution: result.caution,
    evidenceEventIds,
    periodLabel: null,
    suggestions: suggestions.slice(0, 3),
  });
}

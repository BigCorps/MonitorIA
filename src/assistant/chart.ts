import type {
  AssistantChartSpec,
  AssistantPlan,
} from "./contracts";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}

function translatedRole(value: string) {
  return (
    {
      customer: "Clientes",
      staff: "Funcionários",
      delivery_person: "Entregadores",
      visitor: "Visitantes",
      unknown: "Não determinado",
    }[value] ?? value.replaceAll("_", " ")
  );
}

function translatedType(value: string) {
  return (
    {
      person_present: "Pessoa presente",
      person_entered: "Pessoa entrou",
      person_exited: "Pessoa saiu",
      vehicle_present: "Veículo presente",
      vehicle_entered: "Veículo entrou",
      vehicle_exited: "Veículo saiu",
      vehicle_stopped: "Veículo parou",
      object_appeared: "Objeto apareceu",
      object_moved: "Objeto movimentado",
      object_removed: "Objeto removido",
      zone_intrusion: "Área restrita",
      unusual_activity: "Atividade incomum",
      scene_change: "Mudança de ambiente",
      other: "Outro",
    }[value] ?? value.replaceAll("_", " ")
  );
}

function mapNumberRecord(
  value: unknown,
  translate: (key: string) => string,
) {
  return Object.entries(objectValue(value))
    .map(([key, quantity]) => ({
      key,
      label: translate(key),
      value: numberValue(quantity),
    }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);
}

function hourMap(value: unknown) {
  const result = new Map<number, number>();

  if (!Array.isArray(value)) return result;

  for (const item of value) {
    const row = objectValue(item);
    const hour = Number(row.hour);
    const events = numberValue(row.events);

    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
      result.set(hour, events);
    }
  }

  return result;
}

function dayHourSeries(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const row = objectValue(item);
      return {
        date: stringValue(row.date),
        hours: hourMap(row.hours),
      };
    })
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date))
    .slice(-7);
}

function shortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}`;
}

function periodName(fromDate: string, toDate: string) {
  return fromDate === toDate
    ? shortDate(fromDate)
    : `${shortDate(fromDate)} a ${shortDate(toDate)}`;
}

function alignedSeries(
  labels: string[],
  rows: Array<{ key: string; value: number }>,
) {
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return labels.map((label) => values.get(label) ?? 0);
}

function periodSummaryChart(input: {
  plan: AssistantPlan;
  summary: Record<string, unknown>;
  fromDate: string;
  toDate: string;
}): AssistantChartSpec | null {
  const { plan, summary, fromDate, toDate } = input;
  const type = plan.chartType ?? "bar";
  const metric = plan.chartMetric ?? "events_by_hour";

  if (metric === "events_by_hour") {
    const daily = dayHourSeries(summary.byDayHour);

    if (daily.length > 1) {
      const hours = [
        ...new Set(
          daily.flatMap((day) => [...day.hours.keys()]),
        ),
      ].sort((left, right) => left - right);

      if (!hours.length) return null;

      return {
        type,
        title: "Movimento por hora em cada dia",
        xLabel: "Horário",
        yLabel: "Eventos",
        labels: hours.map((hour) => `${String(hour).padStart(2, "0")}h`),
        series: daily.map((day) => ({
          name: shortDate(day.date),
          values: hours.map((hour) => day.hours.get(hour) ?? 0),
        })),
        note:
          "Cada linha representa um dia. Os valores mostram eventos, não pessoas únicas.",
      };
    }

    const hours = hourMap(summary.byHour);
    if (!hours.size) return null;

    const orderedHours = [...hours.keys()].sort(
      (left, right) => left - right,
    );

    return {
      type,
      title: "Movimento por hora",
      xLabel: "Horário",
      yLabel: "Eventos",
      labels: orderedHours.map(
        (hour) => `${String(hour).padStart(2, "0")}h`,
      ),
      series: [
        {
          name: periodName(fromDate, toDate),
          values: orderedHours.map((hour) => hours.get(hour) ?? 0),
        },
      ],
      note: "Os valores mostram eventos, não pessoas únicas.",
    };
  }

  if (metric === "roles") {
    const rows = mapNumberRecord(summary.byRole, translatedRole).slice(0, 8);
    if (!rows.length) return null;

    return {
      type: "bar",
      title: "Aparições por papel operacional",
      xLabel: null,
      yLabel: "Aparições estimadas",
      labels: rows.map((row) => row.label),
      series: [
        {
          name: periodName(fromDate, toDate),
          values: rows.map((row) => row.value),
        },
      ],
      note:
        "Aparições são estimativas e a mesma pessoa pode aparecer em vários eventos.",
    };
  }

  if (metric === "event_types") {
    const rows = mapNumberRecord(summary.byType, translatedType).slice(0, 10);
    if (!rows.length) return null;

    return {
      type: "bar",
      title: "Eventos por categoria",
      xLabel: null,
      yLabel: "Eventos",
      labels: rows.map((row) => row.label),
      series: [
        {
          name: periodName(fromDate, toDate),
          values: rows.map((row) => row.value),
        },
      ],
      note: null,
    };
  }

  const labels = [
    "Eventos",
    "Clientes",
    "Funcionários",
    "Entregas",
    "Objetos",
    "Veículos",
  ];

  return {
    type: "bar",
    title: "Indicadores visuais do período",
    xLabel: null,
    yLabel: "Registros estimados",
    labels,
    series: [
      {
        name: periodName(fromDate, toDate),
        values: [
          numberValue(summary.totalEvents),
          numberValue(summary.customerAppearances),
          numberValue(summary.staffAppearances),
          numberValue(summary.deliveryRelatedEvents),
          numberValue(summary.objectChangeEvents),
          numberValue(summary.vehicleEvents),
        ],
      },
    ],
    note:
      "As métricas possuem naturezas diferentes e não representam pessoas ou veículos únicos.",
  };
}

function comparisonChart(input: {
  plan: AssistantPlan;
  retrievedData: Record<string, unknown>;
}): AssistantChartSpec | null {
  const periodA = objectValue(input.retrievedData.periodA);
  const periodB = objectValue(input.retrievedData.periodB);
  const summaryA = objectValue(periodA.summary);
  const summaryB = objectValue(periodB.summary);
  const nameA = periodName(
    stringValue(periodA.fromDate),
    stringValue(periodA.toDate),
  );
  const nameB = periodName(
    stringValue(periodB.fromDate),
    stringValue(periodB.toDate),
  );
  const metric = input.plan.chartMetric ?? "events_by_hour";
  const type = input.plan.chartType ?? "line";

  if (metric === "events_by_hour") {
    const hoursA = hourMap(summaryA.byHour);
    const hoursB = hourMap(summaryB.byHour);
    const hours = [...new Set([...hoursA.keys(), ...hoursB.keys()])].sort(
      (left, right) => left - right,
    );

    if (!hours.length) return null;

    return {
      type,
      title: "Comparação de movimento por hora",
      xLabel: "Horário",
      yLabel: "Eventos",
      labels: hours.map((hour) => `${String(hour).padStart(2, "0")}h`),
      series: [
        {
          name: nameA,
          values: hours.map((hour) => hoursA.get(hour) ?? 0),
        },
        {
          name: nameB,
          values: hours.map((hour) => hoursB.get(hour) ?? 0),
        },
      ],
      note: "Os valores mostram eventos, não pessoas únicas.",
    };
  }

  if (metric === "roles" || metric === "event_types") {
    const key = metric === "roles" ? "byRole" : "byType";
    const translate = metric === "roles" ? translatedRole : translatedType;
    const rowsA = mapNumberRecord(summaryA[key], (value) => value);
    const rowsB = mapNumberRecord(summaryB[key], (value) => value);
    const labels = [
      ...new Set([...rowsA.map((row) => row.key), ...rowsB.map((row) => row.key)]),
    ].slice(0, 10);

    if (!labels.length) return null;

    return {
      type: "bar",
      title:
        metric === "roles"
          ? "Comparação por papel operacional"
          : "Comparação por categoria de evento",
      xLabel: null,
      yLabel: metric === "roles" ? "Aparições estimadas" : "Eventos",
      labels: labels.map(translate),
      series: [
        {
          name: nameA,
          values: alignedSeries(labels, rowsA),
        },
        {
          name: nameB,
          values: alignedSeries(labels, rowsB),
        },
      ],
      note:
        metric === "roles"
          ? "Aparições não representam pessoas únicas."
          : null,
    };
  }

  const labels = [
    "Eventos",
    "Clientes",
    "Funcionários",
    "Entregas",
    "Objetos",
    "Veículos",
  ];
  const values = (summary: Record<string, unknown>) => [
    numberValue(summary.totalEvents),
    numberValue(summary.customerAppearances),
    numberValue(summary.staffAppearances),
    numberValue(summary.deliveryRelatedEvents),
    numberValue(summary.objectChangeEvents),
    numberValue(summary.vehicleEvents),
  ];

  return {
    type: "bar",
    title: "Comparação de indicadores visuais",
    xLabel: null,
    yLabel: "Registros estimados",
    labels,
    series: [
      { name: nameA, values: values(summaryA) },
      { name: nameB, values: values(summaryB) },
    ],
    note:
      "As métricas possuem naturezas diferentes e não representam pessoas ou veículos únicos.",
  };
}

export function buildAssistantChart(input: {
  plan: AssistantPlan;
  retrievedData: unknown;
  fromDate: string;
  toDate: string;
}): AssistantChartSpec | null {
  if (!input.plan.wantsChart) return null;

  const retrievedData = objectValue(input.retrievedData);

  if (input.plan.intent === "compare_periods") {
    return comparisonChart({
      plan: input.plan,
      retrievedData,
    });
  }

  if (input.plan.intent !== "period_summary") return null;

  return periodSummaryChart({
    plan: input.plan,
    summary: objectValue(retrievedData.summary),
    fromDate: input.fromDate,
    toDate: input.toDate,
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationCameras,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import {
  addDaysToDateOnly,
  dateOnlyToIso,
  searchEvents,
  siteTimezone,
  type SearchEventRow,
} from "@/src/lib/event-search-data";
import {
  buildEventsJson,
  buildEventsMarkdown,
  type OperationalSummaryItem,
} from "@/src/lib/event-export";
import { eventTypeLabel, reviewLabel } from "@/src/lib/event-labels";
import { createClient } from "@/src/lib/supabase/server";
import {
  consumeRateLimit,
  rateLimitHeaders,
} from "@/src/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QuerySchema = z.object({
  format: z.enum(["md", "json"]),
  download: z.enum(["0", "1"]).default("0"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  site: z.string().uuid().or(z.literal("")).default(""),
  camera: z.string().uuid().or(z.literal("")).default(""),
  type: z.string().max(120).default(""),
  review: z.string().max(40).default("all"),
});

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function operationalItems(value: unknown): OperationalSummaryItem[] {
  const summary = objectValue(value);
  return [
    {
      label: "Aparições estimadas de clientes",
      value: numberValue(summary.customerAppearances),
      note: "não representa clientes únicos",
    },
    {
      label: "Aparições de funcionários",
      value: numberValue(summary.staffAppearances),
      note: "a mesma pessoa pode aparecer em vários eventos",
    },
    {
      label: "Aparições de entregadores",
      value: numberValue(summary.deliveryPersonAppearances),
    },
    {
      label: "Eventos com sinais de atendimento",
      value: numberValue(summary.probableServiceInteractions),
      note: "um atendimento pode aparecer em vários capítulos; não confirma venda ou pagamento",
    },
    {
      label: "Situações relacionadas a entregas",
      value: numberValue(summary.deliveryRelatedEvents),
    },
    {
      label: "Eventos com mudanças de objetos",
      value: numberValue(summary.objectChangeEvents),
    },
    {
      label: "Registros de veículos",
      value: numberValue(summary.vehicleAppearances),
      note: "não representa veículos únicos",
    },
  ];
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  let query: z.infer<typeof QuerySchema>;
  try {
    query = QuerySchema.parse(
      Object.fromEntries(url.searchParams.entries()),
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_filters" },
      { status: 400 },
    );
  }

  if (!isValidDateOnly(query.from) || !isValidDateOnly(query.to)) {
    return NextResponse.json(
      { ok: false, error: "invalid_period" },
      { status: 400 },
    );
  }

  const organization = await getCurrentOrganization(user.id);
  if (!organization) {
    return NextResponse.json(
      { ok: false, error: "organization_not_found" },
      { status: 404 },
    );
  }

  let rateLimit;
  try {
    rateLimit = await consumeRateLimit({
      scope: "events-export",
      subject: `${organization.id}:${user.id}`,
      limit: 10,
      windowSeconds: 60,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "rate_limit_unavailable" },
      { status: 503 },
    );
  }

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "too_many_requests" },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }

  const [sites, cameras] = await Promise.all([
    getOrganizationSites(organization.id),
    getOrganizationCameras(organization.id),
  ]);

  const siteId = sites.some((site) => site.id === query.site)
    ? query.site
    : "";
  const cameraId = cameras.some((camera) => camera.id === query.camera)
    ? query.camera
    : "";
  const timeZone = siteTimezone(sites, siteId);
  const fromIso = dateOnlyToIso(query.from, timeZone);
  const toIso = dateOnlyToIso(
    addDaysToDateOnly(query.to, 1),
    timeZone,
  );

  if (!fromIso || !toIso || fromIso >= toIso) {
    return NextResponse.json(
      { ok: false, error: "invalid_period" },
      { status: 400 },
    );
  }

  const allRows: SearchEventRow[] = [];
  let total = 0;
  let offset = 0;
  const batchSize = 200;
  const maximum = 5000;

  do {
    const result = await searchEvents(organization.id, {
      from: fromIso,
      to: toIso,
      siteId,
      cameraId,
      eventType: query.type,
      reviewFilter: query.review,
      limit: batchSize,
      offset,
    });

    total = result.total;
    allRows.push(...result.rows);
    offset += result.rows.length;

    if (!result.rows.length) break;
  } while (offset < total && offset < maximum);

  const supabase = await createClient();
  const { data: summary } = await supabase.rpc(
    "assistant_period_summary",
    {
      p_organization_id: organization.id,
      p_from: fromIso,
      p_to: toIso,
      p_camera_id: cameraId || null,
      p_site_id: siteId || null,
    },
  );

  const input = {
    title: "Relatório de eventos MonitorIA",
    timeZone,
    filters: {
      "Data inicial": query.from,
      "Data final": query.to,
      Local:
        sites.find((site) => site.id === siteId)?.name ?? "Todos",
      Câmera:
        cameras.find((camera) => camera.id === cameraId)?.name ??
        "Todas",
      "Tipo de evento": query.type
        ? eventTypeLabel(query.type)
        : "Todos",
      Revisão: reviewLabel(query.review),
    },
    total,
    truncated: total > allRows.length,
    operationalSummary:
      query.type || query.review !== "all"
        ? []
        : operationalItems(summary),
    events: allRows.map((event) => ({
      id: event.id,
      startedAt: event.startedAt,
      endedAt: event.endedAt,
      cameraName: event.cameraName,
      siteName: event.siteName,
      headline: event.headline,
      eventType: event.eventType,
      eventTypeLabel: eventTypeLabel(event.eventType),
      summary: event.summary,
      confidence: event.confidence,
      requiresReview: event.requiresReview,
      humanVerdict: event.humanVerdict
        ? reviewLabel(event.humanVerdict)
        : null,
      peopleCount: event.peopleCount,
      vehicleCount: event.vehicleCount,
      tags: event.tags,
    })),
  };

  const isMarkdown = query.format === "md";
  const content = isMarkdown
    ? buildEventsMarkdown(input)
    : buildEventsJson(input);
  const extension = isMarkdown ? "md" : "json";
  const filename = `monitoria-eventos-${query.from}-${query.to}.${extension}`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": isMarkdown
        ? "text/markdown; charset=utf-8"
        : "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      ...(query.download === "1"
        ? {
            "Content-Disposition": `attachment; filename="${filename}"`,
          }
        : {}),
    },
  });
}

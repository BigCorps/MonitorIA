import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const repoIndex = args.indexOf("--repo");
const repoArg = repoIndex >= 0 ? args[repoIndex + 1] : process.cwd();

if (!repoArg || repoArg.startsWith("--")) {
  throw new Error("Use --repo CAMINHO para indicar a raiz do repositório.");
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(repoArg);
const packageJson = JSON.parse(
  await readFile(resolve(repoRoot, "package.json"), "utf8"),
);

if (packageJson.name !== "monitoria") {
  throw new Error(`O destino não parece ser o MonitorIA: ${repoRoot}.`);
}

const phaseTwoContract = await readFile(
  resolve(repoRoot, "src/contracts/person-memory.ts"),
  "utf8",
).catch(() => null);
const phaseTwoContinuity = await readFile(
  resolve(repoRoot, "src/lib/event-continuity.ts"),
  "utf8",
).catch(() => null);
const phaseTwoPrompt = await readFile(
  resolve(repoRoot, "src/vision/prompt.ts"),
  "utf8",
).catch(() => null);

if (
  !phaseTwoContract ||
  !phaseTwoContinuity ||
  !phaseTwoPrompt ||
  (!phaseTwoPrompt.includes("VISION_PROMPT_VERSION = 4") &&
    !phaseTwoPrompt.includes("VISION_PROMPT_VERSION = 5"))
) {
  throw new Error(
    "A Fase 2 precisa estar aplicada no repositório antes da Fase 3.",
  );
}

const operations = [];

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function planWrite(relativePath, original, updated) {
  if (original === updated) {
    console.log(`Sem alteração: ${relativePath}`);
    return;
  }

  operations.push({ relativePath, original, updated });
  console.log(`${dryRun ? "Planejado" : "Preparado"}: ${relativePath}`);
}

async function installCompleteFile(relativePath) {
  const [source, original] = await Promise.all([
    readFile(resolve(packageRoot, relativePath), "utf8"),
    readOptional(resolve(repoRoot, relativePath)),
  ]);
  planWrite(relativePath, original, source);
}

async function updateFile(relativePath, updater) {
  const path = resolve(repoRoot, relativePath);
  const original = await readFile(path, "utf8");
  planWrite(relativePath, original, updater(original));
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Bloco não encontrado para ${label}. O arquivo pode ter mudado.`);
  }
  return source.replace(before, after);
}

const completeFiles = [
  "src/contracts/interaction-session.ts",
  "src/contracts/analyzed-event.ts",
  "src/lib/event-analysis.ts",
  "src/lib/operational-session-data.ts",
  "src/lib/operational-session-labels.ts",
  "src/vision/prompt.ts",
  "app/dashboard/sessions/page.tsx",
  "app/dashboard/sessions/session-list.tsx",
  "app/dashboard/sessions/sessions-realtime-refresh.tsx",
  "app/dashboard/sessions/sessions.module.css",
  "app/dashboard/sessions/[sessionId]/page.tsx",
  "supabase/migrations/20260801193000_operational_sessions_v1.sql",
  "supabase/migrations/rollback_operational_sessions_v1.sql",
];

for (const relativePath of completeFiles) {
  await installCompleteFile(relativePath);
}

await updateFile(
  "src/assistant/contracts.ts",
  (source) => replaceRequired(
    source,
`      "continuity_summary",
`,
`      "continuity_summary",
      "interaction_sessions",
`,
    "intenção de sessões no Assistente",
  ),
);

await updateFile(
  "src/assistant/openai.ts",
  (source) => {
    let result = source;

    result = replaceRequired(
      result,
`      "Escolha continuity_summary para perguntas sobre quantas pessoas ou clientes diferentes provavelmente apareceram, quantos atendimentos ocorreram, se eventos pertencem à mesma visita, duração de um atendimento ou capítulos repetidos.",
`,
`      "Escolha continuity_summary para perguntas sobre quantas pessoas ou clientes diferentes provavelmente apareceram, se eventos pertencem à mesma visita ou sobre capítulos repetidos ainda não consolidados.",
      "Escolha interaction_sessions para perguntas sobre atendimentos, entregas, visitas, procedimentos de abertura ou fechamento, duração completa, resultado visual, sessões concluídas ou histórias operacionais compostas por vários capítulos.",
`,
      "planejamento de sessões operacionais",
    );

    result = replaceRequired(
      result,
`      "Explique que capítulos são eventos separados provavelmente pertencentes à mesma visita ou atendimento.",
`,
`      "Explique que capítulos são eventos separados provavelmente pertencentes à mesma visita ou atendimento.",
      "Uma sessão operacional é uma história composta por capítulos relacionados. O resultado é apenas visual e não confirma venda, pagamento, identidade ou intenção.",
      "Ao falar de duração da sessão, use os horários estruturados recuperados e informe quando o encerramento ocorreu por inatividade ou ficou incerto.",
`,
      "redação segura sobre sessões",
    );

    return result;
  },
);

await updateFile(
  "app/api/assistant/query/route.ts",
  (source) => {
    let result = source;

    result = replaceRequired(
      result,
`    if (plan.intent === "continuity_summary") {
`,
`    if (plan.intent === "interaction_sessions") {
      const result = await supabase.rpc(
        "assistant_operational_sessions_summary",
        {
          p_organization_id: organization.id,
          p_from: fromIso,
          p_to: toIso,
          p_camera_id: plan.cameraId,
          p_site_id: plan.siteId,
        },
      );

      if (result.error) {
        throw new Error(result.error.message);
      }

      const payload = objectValue(result.data);
      const sessions = Array.isArray(payload.sessions)
        ? payload.sessions.map(objectValue)
        : [];

      candidateEvidenceIds = sessions
        .flatMap((session) =>
          Array.isArray(session.evidence_event_ids)
            ? session.evidence_event_ids
            : Array.isArray(session.evidenceEventIds)
              ? session.evidenceEventIds
              : [],
        )
        .filter((id): id is string => typeof id === "string");

      retrievedData = {
        operationalSessions: result.data,
        definitions: {
          session:
            "História operacional formada por capítulos visualmente relacionados.",
          outcome:
            "Resultado visual observado; não confirma venda, pagamento ou intenção.",
          closureByInactivity:
            "Encerramento calculado quando não houve novo capítulo dentro da janela configurada.",
        },
      };
    } else if (plan.intent === "continuity_summary") {
`,
      "consulta do Assistente sobre sessões",
    );

    result = replaceRequired(
      result,
`          "estimar pessoas distintas e agrupar capítulos do mesmo atendimento",
`,
`          "estimar pessoas distintas e agrupar capítulos do mesmo atendimento",
          "consolidar capítulos em sessões operacionais com duração e resultado visual",
`,
      "capacidade de sessões",
    );

    return result;
  },
);

await updateFile(
  "src/lib/event-search-data.ts",
  (source) => {
    let result = source;

    result = replaceRequired(
      result,
`  continuityConfidence: number;
  thumbnailAssetId: string | null;
`,
`  continuityConfidence: number;
  operationalSessionId: string | null;
  sessionType: string | null;
  sessionStatus: string | null;
  sessionChapterType: string | null;
  sessionChapterOrder: number | null;
  sessionChapterCount: number;
  sessionDurationSeconds: number;
  sessionConfidence: number;
  thumbnailAssetId: string | null;
`,
      "campos de sessão na pesquisa",
    );

    result = replaceRequired(
      result,
`    continuityConfidence: Number(row.continuity_confidence ?? 0),
    thumbnailAssetId: row.thumbnail_asset_id
`,
`    continuityConfidence: Number(row.continuity_confidence ?? 0),
    operationalSessionId: row.operational_session_id
      ? String(row.operational_session_id)
      : null,
    sessionType: row.session_type ? String(row.session_type) : null,
    sessionStatus: row.session_status ? String(row.session_status) : null,
    sessionChapterType: row.session_chapter_type
      ? String(row.session_chapter_type)
      : null,
    sessionChapterOrder:
      row.session_chapter_order === null ||
      row.session_chapter_order === undefined
        ? null
        : Number(row.session_chapter_order),
    sessionChapterCount: Number(row.session_chapter_count ?? 0),
    sessionDurationSeconds: Number(row.session_duration_seconds ?? 0),
    sessionConfidence: Number(row.session_confidence ?? 0),
    thumbnailAssetId: row.thumbnail_asset_id
`,
      "mapeamento da sessão operacional",
    );

    return result;
  },
);

await updateFile(
  "app/dashboard/events/event-list.tsx",
  (source) => {
    let result = source;

    result = replaceRequired(
      result,
`import {
  eventTypeLabel,
  reviewLabel,
} from "@/src/lib/event-labels";
`,
`import {
  eventTypeLabel,
  reviewLabel,
} from "@/src/lib/event-labels";
import {
  operationalSessionChapterLabel,
  operationalSessionTypeLabel,
} from "@/src/lib/operational-session-labels";
`,
      "labels de sessão nos eventos",
    );

    result = replaceRequired(
      result,
`              {event.interactionEventCount > 1 ? (
                <span>↻ {event.interactionEventCount} capítulos</span>
              ) : null}
              <span>◷ {durationLabel(event.durationSeconds)}</span>
`,
`              {event.interactionEventCount > 1 ? (
                <span>↻ {event.interactionEventCount} capítulos</span>
              ) : null}
              {event.operationalSessionId && event.sessionType ? (
                <span>{operationalSessionTypeLabel(event.sessionType)}</span>
              ) : null}
              {event.sessionChapterOrder && event.sessionChapterType ? (
                <span>
                  Cap. {event.sessionChapterOrder}/{event.sessionChapterCount} · {operationalSessionChapterLabel(event.sessionChapterType)}
                </span>
              ) : null}
              <span>◷ {durationLabel(event.durationSeconds)}</span>
`,
      "badges de sessão nos cards",
    );

    return result;
  },
);

await updateFile(
  "app/dashboard/dashboard-sidebar.tsx",
  (source) => {
    let result = source;

    result = replaceRequired(
      result,
`  | "events"
  | "search"
`,
`  | "events"
  | "sessions"
  | "search"
`,
      "tipo da seção Sessões",
    );

    result = replaceRequired(
      result,
`function BotIcon() {
`,
`function SessionsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h14v4H5z" />
      <path d="M5 11h14v4H5z" />
      <path d="M5 17h14v2H5z" />
      <path d="M8 7h8M8 13h8" />
    </svg>
  );
}

function BotIcon() {
`,
      "ícone da seção Sessões",
    );

    result = replaceRequired(
      result,
`  {
    id: "events",
    href: "/dashboard/events",
    label: "Eventos",
    icon: <EventsIcon />,
  },
  {
    id: "search",
`,
`  {
    id: "events",
    href: "/dashboard/events",
    label: "Eventos",
    icon: <EventsIcon />,
  },
  {
    id: "sessions",
    href: "/dashboard/sessions",
    label: "Sessões",
    icon: <SessionsIcon />,
  },
  {
    id: "search",
`,
      "item Sessões no menu",
    );

    return result;
  },
);

if (dryRun) {
  console.log(
    `Dry-run concluído: ${operations.length} arquivo(s) seriam alterados.`,
  );
  process.exit(0);
}

if (!operations.length) {
  console.log("Fase 3 já está aplicada; nenhum arquivo foi alterado.");
  process.exit(0);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = resolve(
  dirname(repoRoot),
  `MonitorIA-backup-operational-sessions-v1-${timestamp}`,
);

await mkdir(backupRoot, { recursive: true });

for (const operation of operations) {
  if (operation.original === null) continue;
  const path = resolve(backupRoot, operation.relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, operation.original, "utf8");
}

await writeFile(
  resolve(backupRoot, "manifest.json"),
  `${JSON.stringify({
    version: "operational-sessions-v1",
    createdAt: new Date().toISOString(),
    repoRoot,
    operations: operations.map((operation) => ({
      path: operation.relativePath,
      existedBefore: operation.original !== null,
    })),
  }, null, 2)}\n`,
  "utf8",
);

try {
  for (const operation of operations) {
    const path = resolve(repoRoot, operation.relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, operation.updated, "utf8");
  }
} catch (error) {
  for (const operation of operations) {
    const path = resolve(repoRoot, operation.relativePath);
    if (operation.original === null) continue;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, operation.original, "utf8");
  }
  throw error;
}

console.log(`Fase 3 aplicada. Backup: ${backupRoot}`);
console.log("Execute npm run check e npm run build antes do deploy.");

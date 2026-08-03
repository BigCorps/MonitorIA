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

const stageOneContract = await readFile(
  resolve(repoRoot, "src/contracts/visual-state.ts"),
  "utf8",
).catch(() => null);
const stageOnePrompt = await readFile(
  resolve(repoRoot, "src/vision/prompt.ts"),
  "utf8",
).catch(() => null);

if (
  !stageOneContract ||
  !stageOnePrompt ||
  !stageOnePrompt.includes("VISION_PROMPT_VERSION = 3") &&
    !stageOnePrompt.includes("VISION_PROMPT_VERSION = 4")
) {
  throw new Error(
    "A Etapa 1 precisa estar aplicada no repositório antes da Etapa 2.",
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
  "src/contracts/person-memory.ts",
  "src/contracts/analyzed-event.ts",
  "src/contracts/camera-profile.ts",
  "src/lib/agent-camera.ts",
  "src/lib/event-continuity.ts",
  "src/lib/event-analysis.ts",
  "src/vision/prompt.ts",
  "supabase/migrations/20260801131500_short_memory_continuity_v1.sql",
  "supabase/migrations/rollback_short_memory_continuity_v1.sql",
];

for (const relativePath of completeFiles) {
  await installCompleteFile(relativePath);
}

await updateFile(
  "app/api/agent/cameras/[cameraId]/events/route.ts",
  (source) => {
    let result = source;

    result = replaceRequired(
      result,
`import { normalizeAnalyzedEventZones } from "@/src/lib/event-analysis";
`,
`import { normalizeAnalyzedEventZones } from "@/src/lib/event-analysis";
import { persistEventPersonAppearanceAndContinuity } from "@/src/lib/event-continuity";
`,
      "importação da memória curta",
    );

    result = replaceRequired(
      result,
`    visualEntityRows = configuredVisualEntities ?? [];
  }

  let cameraProfile;
`,
`    visualEntityRows = configuredVisualEntities ?? [];
  }

  let staffProfileRows: Array<Record<string, unknown>> = [];

  if (authenticated.camera.shortMemoryEnabled) {
    const {
      data: configuredStaffProfiles,
      error: staffProfilesError,
    } = await supabase
      .from("camera_staff_profiles")
      .select(
        "id,label,description,appearance_signature,zone_ids,min_similarity",
      )
      .eq("organization_id", authenticated.camera.organizationId)
      .eq("camera_id", cameraId)
      .eq("enabled", true)
      .order("sort_order", { ascending: true });

    if (staffProfilesError) {
      return NextResponse.json(
        { ok: false, error: "staff_profiles_unavailable" },
        { status: 500 },
      );
    }

    staffProfileRows = configuredStaffProfiles ?? [];
  }

  let cameraProfile;
`,
      "carregamento dos perfis operacionais",
    );

    result = replaceRequired(
      result,
`      visualEntities: (visualEntityRows ?? []).map(
`,
`      staffProfiles: (staffProfileRows ?? []).map(
        (staffProfile: any) => ({
          id: String(staffProfile.id),
          label: String(staffProfile.label),
          description: String(staffProfile.description),
          appearanceSignature:
            staffProfile.appearance_signature ?? {},
          zoneIds: Array.isArray(staffProfile.zone_ids)
            ? staffProfile.zone_ids.map((id: unknown) => String(id))
            : [],
          minSimilarity: Number(
            staffProfile.min_similarity ?? 0.74,
          ),
        }),
      ),
      visualEntities: (visualEntityRows ?? []).map(
`,
      "perfis operacionais no contexto estável",
    );

    result = replaceRequired(
      result,
`    const eventId = result.event_id
      ? String(result.event_id)
      : null;

    if (!relevant) {
`,
`    const eventId = result.event_id
      ? String(result.event_id)
      : null;

    const continuity =
      relevant &&
      eventId &&
      authenticated.camera.shortMemoryEnabled
        ? await persistEventPersonAppearanceAndContinuity({
            supabase,
            organizationId:
              authenticated.camera.organizationId,
            eventId,
            people: normalizedEvent.people,
          })
        : null;

    if (!relevant) {
`,
      "processamento de continuidade após salvar o evento",
    );

    result = replaceRequired(
      result,
`        requiresReview: normalizedEvent.requiresReview,
      },
`,
`        requiresReview: normalizedEvent.requiresReview,
        continuity,
      },
`,
      "resumo de continuidade na resposta do Agent",
    );

    return result;
  },
);

await updateFile(
  "src/assistant/contracts.ts",
  (source) => replaceRequired(
    source,
`      "operating_hours",
      "visual_state",
`,
`      "operating_hours",
      "visual_state",
      "continuity_summary",
`,
    "intenção de continuidade do Assistente",
  ),
);

await updateFile(
  "src/assistant/openai.ts",
  (source) => {
    let result = source;

    result = replaceRequired(
      result,
`      "Escolha visual_state para perguntas sobre o estado atual ou histórico de caixa, gaveta, armário, porta, objeto configurado, equipamento, iluminação ou área.",
`,
`      "Escolha visual_state para perguntas sobre o estado atual ou histórico de caixa, gaveta, armário, porta, objeto configurado, equipamento, iluminação ou área.",
      "Escolha continuity_summary para perguntas sobre quantas pessoas ou clientes diferentes provavelmente apareceram, quantos atendimentos ocorreram, se eventos pertencem à mesma visita, duração de um atendimento ou capítulos repetidos.",
`,
      "planejamento de continuidade",
    );

    result = replaceRequired(
      result,
`      "Use 'aparições estimadas' em vez de pessoas ou clientes únicos.",
`,
`      "Use 'pessoas distintas prováveis' e 'clientes prováveis' para métricas de memória curta; nunca apresente essas estimativas como identificação ou contagem exata.",
      "Explique que capítulos são eventos separados provavelmente pertencentes à mesma visita ou atendimento.",
      "Perfis de funcionários são operacionais e aprovados, não reconhecimento facial nem identidade civil.",
      "Use 'aparições estimadas' em vez de pessoas ou clientes únicos quando a consulta não vier da camada de continuidade.",
`,
      "redação segura das estimativas",
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
`    if (plan.intent === "operating_hours") {
`,
`    if (plan.intent === "continuity_summary") {
      const result = await supabase.rpc(
        "assistant_continuity_summary",
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
      const groups = Array.isArray(payload.groups)
        ? payload.groups.map(objectValue)
        : [];

      candidateEvidenceIds = groups
        .flatMap((group) =>
          Array.isArray(group.evidenceEventIds)
            ? group.evidenceEventIds
            : [],
        )
        .filter((id): id is string => typeof id === "string");

      retrievedData = {
        continuity: result.data,
        definitions: {
          probableDistinctPeople:
            "Estimativa temporária baseada em aparência não biométrica, posição e proximidade temporal.",
          interactionGroup:
            "Conjunto de capítulos que provavelmente pertencem à mesma visita ou atendimento.",
          staffProfile:
            "Perfil operacional aprovado; não é reconhecimento facial.",
        },
      };
    } else if (plan.intent === "operating_hours") {
`,
      "consulta do Assistente sobre continuidade",
    );

    result = replaceRequired(
      result,
`          "informar abertura e fechamento visualmente confirmados",
`,
`          "estimar pessoas distintas e agrupar capítulos do mesmo atendimento",
          "diferenciar funcionários prováveis por perfis operacionais aprovados",
          "informar abertura e fechamento visualmente confirmados",
`,
      "capacidades de memória curta",
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
`  peopleCount: number;
  vehicleCount: number;
  thumbnailAssetId: string | null;
`,
`  peopleCount: number;
  vehicleCount: number;
  interactionGroupId: string | null;
  isContinuation: boolean;
  interactionEventCount: number;
  probablePeopleCount: number;
  probableCustomerCount: number;
  probableStaffCount: number;
  continuityConfidence: number;
  thumbnailAssetId: string | null;
`,
      "campos de continuidade na pesquisa",
    );

    result = replaceRequired(
      result,
`    peopleCount: Number(row.people_count ?? 0),
    vehicleCount: Number(row.vehicle_count ?? 0),
    thumbnailAssetId: row.thumbnail_asset_id
`,
`    peopleCount: Number(row.people_count ?? 0),
    vehicleCount: Number(row.vehicle_count ?? 0),
    interactionGroupId: row.interaction_group_id
      ? String(row.interaction_group_id)
      : null,
    isContinuation: Boolean(row.is_continuation),
    interactionEventCount: Number(row.interaction_event_count ?? 1),
    probablePeopleCount: Number(row.probable_people_count ?? 0),
    probableCustomerCount: Number(row.probable_customer_count ?? 0),
    probableStaffCount: Number(row.probable_staff_count ?? 0),
    continuityConfidence: Number(row.continuity_confidence ?? 0),
    thumbnailAssetId: row.thumbnail_asset_id
`,
      "mapeamento da continuidade",
    );

    return result;
  },
);

await updateFile(
  "app/dashboard/events/event-list.tsx",
  (source) => replaceRequired(
    source,
`              <span>◇ {event.vehicleCount} veículos</span>
              <span>◷ {durationLabel(event.durationSeconds)}</span>
`,
`              <span>◇ {event.vehicleCount} veículos</span>
              {event.probableCustomerCount > 0 ? (
                <span>≈ {event.probableCustomerCount} cliente(s) provável(is)</span>
              ) : null}
              {event.interactionEventCount > 1 ? (
                <span>↻ {event.interactionEventCount} capítulos</span>
              ) : null}
              <span>◷ {durationLabel(event.durationSeconds)}</span>
`,
    "badges de continuidade nos cards",
  ),
);

if (dryRun) {
  console.log(
    `Dry-run concluído: ${operations.length} arquivo(s) seriam alterados.`,
  );
  process.exit(0);
}

if (!operations.length) {
  console.log("Etapa 2 já está aplicada; nenhum arquivo foi alterado.");
  process.exit(0);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = resolve(
  dirname(repoRoot),
  `MonitorIA-backup-short-memory-v1-${timestamp}`,
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
    version: "short-memory-v1",
    createdAt: new Date().toISOString(),
    repoRoot,
    operations: operations.map((operation) => ({
      path: operation.relativePath,
      existedBefore: operation.original !== null,
    })),
  }, null, 2)}\n`,
  "utf8",
);

for (const operation of operations) {
  const path = resolve(repoRoot, operation.relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, operation.updated, "utf8");
  console.log(`Atualizado: ${operation.relativePath}`);
}

console.log(`Backup criado em: ${backupRoot}`);
console.log("Etapa 2 aplicada no código. Execute npm run check e npm run build.");

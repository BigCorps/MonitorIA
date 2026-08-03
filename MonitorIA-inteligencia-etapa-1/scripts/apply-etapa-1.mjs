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

const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repoRoot = resolve(repoArg);

if (repoRoot === packageRoot) {
  throw new Error(
    "O destino deve ser o repositório MonitorIA, não a pasta do pacote.",
  );
}

const packageJsonPath = resolve(repoRoot, "package.json");
let packageJson;
try {
  packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
} catch {
  throw new Error(
    `Não encontrei um package.json válido em ${repoRoot}.`,
  );
}

if (packageJson.name !== "monitoria") {
  throw new Error(
    `O destino não parece ser o repositório MonitorIA: ${repoRoot}.`,
  );
}

const operations = [];

async function readOptional(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function planWrite(relativePath, original, updated) {
  if (updated === original) {
    console.log(`Sem alteração: ${relativePath}`);
    return;
  }

  operations.push({
    relativePath,
    original,
    updated,
  });
  console.log(
    `${dryRun ? "Planejado" : "Preparado"}: ${relativePath}`,
  );
}

async function installCompleteFile(relativePath) {
  const sourcePath = resolve(packageRoot, relativePath);
  const targetPath = resolve(repoRoot, relativePath);
  const [source, original] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readOptional(targetPath),
  ]);
  planWrite(relativePath, original, source);
}

async function updateFile(relativePath, updater) {
  const filePath = resolve(repoRoot, relativePath);
  const original = await readFile(filePath, "utf8");
  const updated = updater(original);
  planWrite(relativePath, original, updated);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Bloco não encontrado para ${label}. O arquivo pode ter mudado.`);
  }
  return source.replace(before, after);
}

function replaceAllRequired(source, before, after, expectedCount, label) {
  const count = source.split(before).length - 1;
  if (count === 0 && source.includes(after)) return source;
  if (count !== expectedCount) {
    throw new Error(
      `${label}: esperado ${expectedCount} ocorrência(s), encontrado ${count}.`,
    );
  }
  return source.split(before).join(after);
}

const completeFiles = [
  "src/contracts/camera-profile-point.ts",
  "src/contracts/visual-state.ts",
  "src/contracts/analyzed-event.ts",
  "src/contracts/camera-profile.ts",
  "src/lib/agent-camera.ts",
  "src/lib/event-analysis.ts",
  "src/vision/prompt.ts",
  "src/vision/visual-state.ts",
  "supabase/migrations/20260731223000_visual_state_engine_v1.sql",
  "supabase/migrations/rollback_visual_state_engine_v1.sql",
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
`import {
  getVisionPlan,
  otherValidationModel,
} from "@/src/vision/plans";
`,
`import {
  getVisionPlan,
  otherValidationModel,
} from "@/src/vision/plans";
import {
  buildVisionPromptHash,
  VISION_PROMPT_VERSION,
} from "@/src/vision/prompt";
`,
      "importação da versão e hash do prompt",
    );

    result = replaceRequired(
      result,
`  if (zonesError) {
    return NextResponse.json(
      { ok: false, error: "active_zones_unavailable" },
      { status: 500 },
    );
  }

  let cameraProfile;
`,
`  if (zonesError) {
    return NextResponse.json(
      { ok: false, error: "active_zones_unavailable" },
      { status: 500 },
    );
  }

  let visualEntityRows: Array<Record<string, unknown>> = [];

  if (authenticated.camera.visualStateEnabled) {
    const {
      data: configuredVisualEntities,
      error: visualEntitiesError,
    } = await supabase
      .from("camera_visual_entities")
      .select(
        "id,name,entity_type,polygon,state_definitions,primary_operational_marker,min_confidence,reliability",
      )
      .eq("organization_id", authenticated.camera.organizationId)
      .eq("camera_id", cameraId)
      .eq("camera_profile_id", profile.id)
      .eq("enabled", true)
      .order("sort_order", { ascending: true });

    if (visualEntitiesError) {
      return NextResponse.json(
        { ok: false, error: "visual_entities_unavailable" },
        { status: 500 },
      );
    }

    visualEntityRows = configuredVisualEntities ?? [];
  }

  let cameraProfile;
`,
      "carregamento das entidades visuais",
    );

    result = replaceRequired(
      result,
`      zones: (zoneRows ?? []).map((zone: any) => ({
        id: String(zone.id),
        name: String(zone.name),
        type: String(zone.zone_type),
        personRoleHint: String(
          zone.person_role_hint ?? "none",
        ),
        polygon: zone.polygon,
        description: String(zone.description ?? ""),
      })),
    });
`,
`      zones: (zoneRows ?? []).map((zone: any) => ({
        id: String(zone.id),
        name: String(zone.name),
        type: String(zone.zone_type),
        personRoleHint: String(
          zone.person_role_hint ?? "none",
        ),
        polygon: zone.polygon,
        description: String(zone.description ?? ""),
      })),
      visualEntities: (visualEntityRows ?? []).map(
        (entity: any) => ({
          id: String(entity.id),
          name: String(entity.name),
          type: String(entity.entity_type),
          polygon: entity.polygon,
          stateDefinitions: entity.state_definitions,
          primaryOperationalMarker: Boolean(
            entity.primary_operational_marker,
          ),
          minConfidence: Number(
            entity.min_confidence ?? 0.82,
          ),
          reliability: String(
            entity.reliability ?? "medium",
          ),
        }),
      ),
    });
`,
      "montagem do perfil com entidades visuais",
    );


    result = replaceRequired(
      result,
`  const localMetrics = {
    ...input.localMetrics,
    planCode,
  };

  let analysisJobId = existingJob ? String(existingJob.id) : null;
`,
`  const localMetrics = {
    ...input.localMetrics,
    planCode,
  };

  const promptHash = buildVisionPromptHash(
    cameraProfile,
    visionPlan.mode,
  );

  let analysisJobId = existingJob ? String(existingJob.id) : null;
`,
      "cálculo do hash do prompt",
    );

    result = replaceAllRequired(
      result,
      "        prompt_version: 2,",
      "        prompt_version: VISION_PROMPT_VERSION,\n        prompt_hash: promptHash,",
      2,
      "versão e hash do prompt",
    );

    result = replaceRequired(
      result,
      "      modelGroup: visionPlan.mode,",
      "      modelGroup: `${visionPlan.mode}:${promptHash.slice(0, 12)}`,",
      "hash na chave de cache do prompt",
    );

    result = replaceRequired(
      result,
`    const normalizedEvent = normalizeAnalyzedEventZones(
      finalAnalysis.event,
      allowedZones,
    );
`,
`    const normalizedEvent = normalizeAnalyzedEventZones(
      finalAnalysis.event,
      allowedZones,
      cameraProfile.visualEntities,
    );
`,
      "normalização do evento final",
    );

    result = replaceRequired(
      result,
`            nano_payload: normalizeAnalyzedEventZones(
              nano.event,
              allowedZones,
            ),
            mini_payload: normalizeAnalyzedEventZones(
              mini.event,
              allowedZones,
            ),
`,
`            nano_payload: normalizeAnalyzedEventZones(
              nano.event,
              allowedZones,
              cameraProfile.visualEntities,
            ),
            mini_payload: normalizeAnalyzedEventZones(
              mini.event,
              allowedZones,
              cameraProfile.visualEntities,
            ),
`,
      "normalização dos candidatos A/B",
    );

    return result;
  },
);

await updateFile(
  "src/assistant/contracts.ts",
  (source) =>
    replaceRequired(
      source,
`    intent: z.enum([
      "period_summary",
`,
`    intent: z.enum([
      "operating_hours",
      "visual_state",
      "period_summary",
`,
      "intenções do Assistente",
    ),
);

await updateFile(
  "src/assistant/openai.ts",
  (source) => {
    let result = source;

    result = replaceRequired(
      result,
`      "Você planeja consultas seguras ao banco de eventos do MonitorIA.",
      "Escolha period_summary para contagens, médias, horários, clientes, funcionários, entregas, objetos, veículos ou panorama de um período.",
`,
`      "Você planeja consultas seguras ao banco de eventos do MonitorIA.",
      "Escolha operating_hours para perguntas sobre abertura, fechamento, horário real de funcionamento, duração aberta, atraso, fechamento antecipado ou reabertura.",
      "Escolha visual_state para perguntas sobre o estado atual ou histórico de caixa, gaveta, armário, porta, objeto configurado, equipamento, iluminação ou área.",
      "Escolha period_summary para contagens, médias, horários, clientes, funcionários, entregas, objetos, veículos ou panorama de um período.",
`,
      "planejamento de estados visuais",
    );

    result = replaceRequired(
      result,
`      "Aparições não são pessoas únicas e atendimento provável não confirma venda.",
      "Responda somente no esquema estruturado solicitado.",
`,
`      "Aparições não são pessoas únicas e atendimento provável não confirma venda.",
      "O horário declarado é contexto. O estado visual confirmado tem prioridade para responder sobre abertura e fechamento.",
      "Responda somente no esquema estruturado solicitado.",
`,
      "regra de prioridade visual",
    );

    result = replaceRequired(
      result,
`      "Explique números com linguagem clara e indique quando são estimativas.",
      "Use 'aparições estimadas' em vez de pessoas ou clientes únicos.",
`,
`      "Explique números com linguagem clara e indique quando são estimativas.",
      "Para abertura e fechamento, respeite openingPrecision e closingPrecision: observed_only significa apenas que o local já aparecia naquele estado no horário, não que a transição ocorreu exatamente naquele instante.",
      "Não transforme firstOpenObservedAt em horário exato de abertura quando openedAt for null.",
      "Para estados visuais, diferencie observação, transição visível e fotografia forte de um único momento.",
      "outsideDeclaredHours significa fora do horário cadastrado; afterConfirmedClosing significa depois de um fechamento visual confirmado e antes de uma reabertura confirmada.",
      "Use 'aparições estimadas' em vez de pessoas ou clientes únicos.",
`,
      "redação baseada na precisão",
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
`    if (plan.intent === "period_summary") {
`,
`    if (plan.intent === "operating_hours") {
      const result = await supabase.rpc(
        "assistant_operating_hours_summary",
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
        .flatMap((session) => [
          typeof session.openingEventId === "string"
            ? session.openingEventId
            : null,
          typeof session.closingEventId === "string"
            ? session.closingEventId
            : null,
        ])
        .filter((id): id is string => Boolean(id));

      retrievedData = {
        operatingHours: result.data,
        definitions: {
          observedOnly:
            "O estado já era visível naquele momento; a transição exata não foi capturada.",
          visibleTransition:
            "Os quadros mostram visualmente a mudança de estado.",
          declaredHours:
            "O horário cadastrado é contexto e não prova que o estabelecimento estava aberto ou fechado.",
        },
      };
    } else if (plan.intent === "visual_state") {
      const result = await supabase.rpc(
        "assistant_visual_state_summary",
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
      const transitions = Array.isArray(payload.transitions)
        ? payload.transitions.map(objectValue)
        : [];

      candidateEvidenceIds = transitions
        .map((transition) => transition.eventId)
        .filter((id): id is string => typeof id === "string");

      retrievedData = {
        visualStates: result.data,
        definitions: {
          outsideDeclaredHours:
            "O evento ocorreu fora da janela semanal cadastrada.",
          afterConfirmedClosing:
            "O evento ocorreu depois de um fechamento visual confirmado e antes de uma reabertura confirmada.",
        },
      };
    } else if (plan.intent === "period_summary") {
`,
      "consultas de estados visuais",
    );

    result = replaceRequired(
      result,
`        capabilities: [
          "resumir períodos",
`,
`        capabilities: [
          "informar abertura e fechamento visualmente confirmados",
          "consultar o estado atual de entidades configuradas",
          "localizar mudanças em caixas, armários, objetos, equipamentos e áreas",
          "resumir períodos",
`,
      "capacidades do Assistente",
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
  console.log("Etapa 1 já está aplicada; nenhum arquivo foi alterado.");
  process.exit(0);
}

const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");
const backupRoot = resolve(
  dirname(repoRoot),
  `MonitorIA-backup-visual-state-v1-${timestamp}`,
);

await mkdir(backupRoot, { recursive: true });

for (const operation of operations) {
  if (operation.original === null) continue;
  const backupPath = resolve(backupRoot, operation.relativePath);
  await mkdir(dirname(backupPath), { recursive: true });
  await writeFile(backupPath, operation.original, "utf8");
}

const manifest = {
  version: "visual-state-v1",
  createdAt: new Date().toISOString(),
  repoRoot,
  operations: operations.map((operation) => ({
    path: operation.relativePath,
    existedBefore: operation.original !== null,
  })),
};

await writeFile(
  resolve(backupRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}
`,
  "utf8",
);

for (const operation of operations) {
  const targetPath = resolve(repoRoot, operation.relativePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, operation.updated, "utf8");
  console.log(`Atualizado: ${operation.relativePath}`);
}

console.log("Etapa 1 aplicada com sucesso.");
console.log(`Backup do código: ${backupRoot}`);

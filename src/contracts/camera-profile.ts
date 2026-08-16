import { z } from "zod";
import { PointSchema } from "./camera-profile-point";
import { CameraStaffProfileSchema } from "./person-memory";
import { CameraVisualEntitySchema } from "./visual-state";
import {
  CameraIntelligenceConfigSchema,
  DefaultCameraIntelligenceConfig,
} from "./scene-intelligence";

export { PointSchema } from "./camera-profile-point";

export const CameraOperationalContextSchema = z.enum([
  "commerce",
  "entrance",
  "garage",
  "street",
  "corridor",
  "indoor",
  "custom",
]);

export type CameraOperationalContext = z.infer<
  typeof CameraOperationalContextSchema
>;

export const PersonRoleHintSchema = z.enum([
  "none",
  "staff",
  "customer",
  "delivery_person",
  "visitor",
  "shared",
]);

export const CameraZoneSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    type: z.enum([
      "entry",
      "exit",
      "service",
      "restricted",
      "ignore",
      "general",
    ]),
    personRoleHint: PersonRoleHintSchema.default("none"),
    polygon: z.array(PointSchema).min(3).max(50),
    description: z.string().trim().max(500),
  })
  .strict();

const CameraProfileBaseSchema = z
  .object({
    cameraId: z.string().uuid(),
    profileVersion: z.number().int().positive(),
    operationalContext: CameraOperationalContextSchema.optional(),
    environmentDescription: z.string().trim().min(1).max(2000),
    monitoringGoals: z
      .array(z.string().trim().min(1).max(300))
      .min(1)
      .max(30),
    ignoreInstructions: z
      .array(z.string().trim().min(1).max(300))
      .max(30),
    zones: z.array(CameraZoneSchema).max(50),
    visualEntities: z
      .array(CameraVisualEntitySchema)
      .max(30)
      .default([]),
    staffProfiles: z
      .array(CameraStaffProfileSchema)
      .max(20)
      .default([]),
    intelligence: CameraIntelligenceConfigSchema.default(
      DefaultCameraIntelligenceConfig,
    ),
    timezone: z.string().trim().min(1).max(100),
  })
  .strict();

type CameraProfileBase = z.infer<typeof CameraProfileBaseSchema>;

type ContextScore = Record<CameraOperationalContext, number>;

function normalizedText(values: unknown[]) {
  return values
    .map((value) => String(value ?? "").trim().toLocaleLowerCase("pt-BR"))
    .filter(Boolean)
    .join(" \n ");
}

function addKeywordScore(
  scores: ContextScore,
  text: string,
  context: CameraOperationalContext,
  keywords: Array<[string, number]>,
) {
  for (const [keyword, weight] of keywords) {
    if (text.includes(keyword)) {
      scores[context] += weight;
    }
  }
}

export function inferCameraOperationalContext(
  profile: Pick<
    CameraProfileBase,
    | "environmentDescription"
    | "monitoringGoals"
    | "ignoreInstructions"
    | "zones"
    | "intelligence"
  >,
): CameraOperationalContext {
  const scores: ContextScore = {
    commerce: 0,
    entrance: 0,
    garage: 0,
    street: 0,
    corridor: 0,
    indoor: 0,
    custom: 0,
  };

  const text = normalizedText([
    profile.environmentDescription,
    ...profile.monitoringGoals,
    ...profile.ignoreInstructions,
    ...profile.zones.flatMap((zone) => [zone.name, zone.description]),
  ]);

  addKeywordScore(scores, text, "street", [
    ["rua pública", 7],
    ["via pública", 7],
    ["logradouro", 5],
    ["calçada", 4],
    ["tráfego", 4],
    ["rua", 3],
    ["perímetro externo", 3],
  ]);

  addKeywordScore(scores, text, "garage", [
    ["garagem", 7],
    ["estacionamento", 7],
    ["vaga", 4],
    ["rampa", 3],
    ["parking", 5],
  ]);

  addKeywordScore(scores, text, "entrance", [
    ["portaria", 8],
    ["entrada principal", 6],
    ["controle de acesso", 6],
    ["portão", 4],
    ["entrada", 3],
    ["acesso", 3],
  ]);

  addKeywordScore(scores, text, "corridor", [
    ["corredor", 8],
    ["escada", 6],
    ["circulação", 5],
    ["hall", 4],
    ["passagem interna", 4],
  ]);

  addKeywordScore(scores, text, "commerce", [
    ["balcão", 8],
    ["caixa", 7],
    ["atendimento", 7],
    ["ponto de venda", 6],
    ["comércio", 5],
    ["loja", 5],
    ["cliente", 3],
  ]);

  addKeywordScore(scores, text, "indoor", [
    ["ambiente interno", 5],
    ["área interna", 5],
    ["sala", 3],
    ["interior", 2],
  ]);

  for (const zone of profile.zones) {
    if (zone.type === "service") scores.commerce += 6;
    if (zone.type === "entry" || zone.type === "exit") scores.entrance += 2;
    if (
      zone.personRoleHint === "staff" ||
      zone.personRoleHint === "customer" ||
      zone.personRoleHint === "delivery_person"
    ) {
      scores.commerce += 2;
    }
  }

  const mode = profile.intelligence.mode;
  if (mode === "parking") scores.garage += 8;
  if (mode === "entrance") scores.entrance += 8;
  if (mode === "corridor") scores.corridor += 8;
  if (mode === "service_counter" || mode === "checkout") {
    scores.commerce += 8;
  }

  const priority: CameraOperationalContext[] = [
    "commerce",
    "street",
    "garage",
    "entrance",
    "corridor",
    "indoor",
    "custom",
  ];

  let selected: CameraOperationalContext = "custom";
  let bestScore = 0;

  for (const context of priority) {
    if (scores[context] > bestScore) {
      selected = context;
      bestScore = scores[context];
    }
  }

  return selected;
}

function runtimeContextDirectives(context: CameraOperationalContext) {
  switch (context) {
    case "commerce":
      return {
        monitoringGoal:
          "Contexto operacional principal: comércio/atendimento. Use cliente, funcionário e atendimento somente quando zonas e ações visíveis sustentarem esses papéis.",
        ignoreInstruction:
          "Ignore transeuntes externos sem aproximação, permanência ou interação real com a área de atendimento.",
      };
    case "entrance":
      return {
        monitoringGoal:
          "Contexto operacional principal: entrada/portaria. Diferencie cruzar o limite de acesso de apenas passar pela área externa.",
        ignoreInstruction:
          "Não trate pessoa ou veículo que apenas passa diante do imóvel como entrada ou saída sem transição visível pelo acesso configurado.",
      };
    case "garage":
      return {
        monitoringGoal:
          "Contexto operacional principal: garagem/estacionamento. Priorize entrada, saída, parada nova e mudança de posição dentro das áreas configuradas.",
        ignoreInstruction:
          "Veículos já estacionados e imóveis são fundo de cena. Não repita entrada ou presença sem mudança observável.",
      };
    case "street":
      return {
        monitoringGoal:
          "Contexto operacional principal: rua/perímetro externo. Considere relevante a transição real entre a via pública e os acessos do imóvel, além de paradas ou permanências configuradas.",
        ignoreInstruction:
          "Ignore tráfego normal e pedestres apenas atravessando rua ou calçada. Não use cliente, funcionário, balcão ou atendimento sem uma zona explícita de serviço.",
      };
    case "corridor":
      return {
        monitoringGoal:
          "Contexto operacional principal: corredor/escada/circulação. Priorize entrada, saída, permanência incomum e acesso às zonas definidas.",
        ignoreInstruction:
          "Não aplique linguagem de comércio ou atendimento a simples circulação interna sem evidência específica no perfil.",
      };
    case "indoor":
      return {
        monitoringGoal:
          "Contexto operacional principal: área interna genérica. Siga os objetivos e zonas do perfil sem presumir atendimento comercial.",
        ignoreInstruction:
          "Não invente papéis de cliente, funcionário ou atendimento quando o perfil não trouxer evidência operacional para isso.",
      };
    case "custom":
    default:
      return {
        monitoringGoal:
          "Contexto operacional principal: personalizado. Dê prioridade aos objetivos, zonas e instruções definidos no perfil da câmera.",
        ignoreInstruction:
          "Não aplique automaticamente regras de comércio, rua, garagem ou portaria quando o perfil não sustentar esse contexto.",
      };
  }
}

function uniqueRuntimeStrings(values: string[], maximum: number) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const text = value.trim();
    const key = text.toLocaleLowerCase("pt-BR");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maximum) break;
  }

  return result;
}

export const CameraProfileSchema = CameraProfileBaseSchema.transform(
  (profile) => {
    const operationalContext =
      profile.operationalContext ?? inferCameraOperationalContext(profile);
    const directives = runtimeContextDirectives(operationalContext);

    return {
      ...profile,
      operationalContext,
      monitoringGoals: uniqueRuntimeStrings(
        [directives.monitoringGoal, ...profile.monitoringGoals],
        30,
      ),
      ignoreInstructions: uniqueRuntimeStrings(
        [directives.ignoreInstruction, ...profile.ignoreInstructions],
        30,
      ),
    };
  },
);

export type CameraProfile = Omit<
  z.infer<typeof CameraProfileSchema>,
  "operationalContext"
> & {
  operationalContext?: CameraOperationalContext;
};

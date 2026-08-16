import assert from "node:assert/strict";
import test from "node:test";
import {
  CameraProfileSchema,
  inferCameraOperationalContext,
} from "../src/contracts/camera-profile.js";
import { DefaultCameraIntelligenceConfig } from "../src/contracts/scene-intelligence.js";

const polygon = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
];

test("perfil da rua em frente ao prédio resolve contexto street", () => {
  const context = inferCameraOperationalContext({
    environmentDescription:
      "Rua em frente à fachada de um prédio, com pista de rolamento, calçada e uma garagem no canto direito.",
    monitoringGoals: [
      "Diferenciar tráfego de passagem na via pública da entrada efetiva no imóvel",
    ],
    ignoreInstructions: [
      "Ignorar tráfego normal que apenas atravessa a rua pública",
    ],
    zones: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Via pública - passagem",
        type: "ignore" as const,
        personRoleHint: "none" as const,
        polygon,
        description: "Pista onde veículos circulam em trânsito.",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Entrada de pedestres",
        type: "entry" as const,
        personRoleHint: "shared" as const,
        polygon,
        description: "Acesso ao prédio.",
      },
    ],
    intelligence: { ...DefaultCameraIntelligenceConfig },
  });

  assert.equal(context, "street");
});

test("perfil comercial com balcão resolve contexto commerce", () => {
  const context = inferCameraOperationalContext({
    environmentDescription:
      "Área interna de loja com balcão de atendimento e caixa.",
    monitoringGoals: ["Observar atendimento no balcão"],
    ignoreInstructions: [],
    zones: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Balcão",
        type: "service" as const,
        personRoleHint: "shared" as const,
        polygon,
        description: "Ponto de atendimento entre funcionário e cliente.",
      },
    ],
    intelligence: { ...DefaultCameraIntelligenceConfig },
  });

  assert.equal(context, "commerce");
});

test("perfil de corredor e escada resolve contexto corridor", () => {
  const context = inferCameraOperationalContext({
    environmentDescription:
      "Corredor interno com escada e circulação entre andares.",
    monitoringGoals: ["Registrar circulação na escada"],
    ignoreInstructions: [],
    zones: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Escada",
        type: "general" as const,
        personRoleHint: "shared" as const,
        polygon,
        description: "Área de circulação interna.",
      },
    ],
    intelligence: {
      ...DefaultCameraIntelligenceConfig,
      mode: "corridor" as const,
    },
  });

  assert.equal(context, "corridor");
});

test("CameraProfileSchema injeta regras runtime sem alterar o perfil salvo", () => {
  const profile = CameraProfileSchema.parse({
    cameraId: "55555555-5555-4555-8555-555555555555",
    profileVersion: 3,
    environmentDescription:
      "Rua pública em frente ao prédio com calçada e acesso de pedestres.",
    monitoringGoals: ["Detectar entrada real no prédio"],
    ignoreInstructions: ["Ignorar sombras"],
    zones: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        name: "Via pública",
        type: "ignore",
        personRoleHint: "none",
        polygon,
        description: "Tráfego normal de passagem.",
      },
    ],
    intelligence: { ...DefaultCameraIntelligenceConfig },
    timezone: "America/Sao_Paulo",
  });

  assert.equal(profile.operationalContext, "street");
  assert.match(profile.monitoringGoals[0], /rua\/perímetro externo/i);
  assert.match(profile.ignoreInstructions[0], /tráfego normal/i);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  CameraProfileDraftSchema,
} from "../src/contracts/camera-profile-draft.js";

const validProfile = {
  operationalContext: "commerce",
  environmentDescription:
    "Entrada interna de uma loja, com balcão lateral e porta de acesso visível.",
  sceneType: "indoor",
  fixedElements: ["balcão", "porta principal"],
  monitoringGoals: [
    "registrar entrada e saída de pessoas",
    "detectar permanência incomum na entrada",
  ],
  ignoreInstructions: [
    "ignorar pequenas variações de iluminação",
  ],
  zones: [
    {
      name: "Entrada principal",
      type: "entry",
      personRoleHint: "customer",
      description:
        "Área da porta e passagem imediata.",
      polygon: [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.2 },
        { x: 0.5, y: 0.9 },
        { x: 0.1, y: 0.9 },
      ],
    },
  ],
  privacyNotes: [
    "não identificar pessoas por rosto",
  ],
  imageQuality: {
    overall: "good",
    lighting: "iluminação uniforme",
    visibility: "áreas principais visíveis",
    limitations: [],
  },
  confidence: 0.9,
};

test("aceita um perfil estruturado válido", () => {
  const parsed =
    CameraProfileDraftSchema.parse(validProfile);

  assert.equal(
    parsed.zones[0]?.type,
    "entry",
  );
  assert.equal(
    parsed.zones[0]?.personRoleHint,
    "customer",
  );
});

test("aplica none em perfis antigos sem pista de papel", () => {
  const legacy = {
    ...validProfile,
    zones: [
      {
        ...validProfile.zones[0],
        personRoleHint: undefined,
      },
    ],
  };

  const parsed =
    CameraProfileDraftSchema.parse(legacy);

  assert.equal(
    parsed.zones[0]?.personRoleHint,
    "none",
  );
});

test("rejeita coordenadas fora do quadro", () => {
  assert.throws(() =>
    CameraProfileDraftSchema.parse({
      ...validProfile,
      zones: [
        {
          ...validProfile.zones[0],
          polygon: [
            { x: -0.1, y: 0.2 },
            { x: 0.5, y: 0.2 },
            { x: 0.5, y: 0.9 },
          ],
        },
      ],
    }),
  );
});

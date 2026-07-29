import assert from "node:assert/strict";
import test from "node:test";
import {
  CameraProfileSchema,
} from "../src/contracts/camera-profile.js";

test("perfil separa zona de funcionário e cliente", () => {
  const profile = CameraProfileSchema.parse({
    cameraId:
      "0a9a26c1-4c81-4596-a104-959ce305e355",
    profileVersion: 2,
    environmentDescription:
      "Balcão de atendimento com área interna e área frontal.",
    monitoringGoals: [
      "Acompanhar atendimentos no balcão",
    ],
    ignoreInstructions: [],
    timezone: "America/Sao_Paulo",
    zones: [
      {
        id:
          "556793b8-19a1-40b9-921d-5b5682cb06d7",
        name: "Área interna",
        type: "service",
        personRoleHint: "staff",
        description:
          "Área ocupada por funcionários.",
        polygon: [
          { x: 0, y: 0 },
          { x: 0.5, y: 0 },
          { x: 0.5, y: 0.5 },
        ],
      },
    ],
  });

  assert.equal(
    profile.zones[0]?.personRoleHint,
    "staff",
  );
});

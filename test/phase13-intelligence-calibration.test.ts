import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assistantPeriodLabel,
  localizeAssistantPayload,
} from "../src/lib/assistant-display.js";
import { classifyOperationalPerson } from "../src/lib/operational-person-role.js";
import { buildVisionInstructions } from "../src/vision/prompt.js";
import { EmptyPersonAppearance } from "../src/contracts/person-memory.js";
import { isLikelyCameraNoise } from "../agent/src/motion.js";

const baseAppearance = {
  ...EmptyPersonAppearance,
  distinctiveVisibleFeatures: [] as string[],
  confidence: 0.7,
};

function person(role: "staff" | "customer" | "visitor", zoneIds: string[]) {
  return {
    localTrackId: "p1",
    role,
    roleConfidence: 0.9,
    upperClothingColor: null,
    lowerClothingColor: null,
    accessories: [],
    carrying: [],
    zoneIds,
    appearance: baseAppearance,
    confidence: 0.9,
  };
}

test("passagem externa não vira cliente sem atendimento no balcão", () => {
  const result = classifyOperationalPerson({
    person: person("customer", ["rua"]),
    sessionSignals: [],
    zones: [{ id: "rua", personRoleHint: "customer" }],
  });

  assert.equal(result.operationalRole, "visitor");
  assert.equal(result.engagedAtCounter, false);
});

test("cliente no balcão exige sinal visual de atendimento", () => {
  const result = classifyOperationalPerson({
    person: person("customer", ["balcao"]),
    sessionSignals: [
      {
        type: "service_continued",
        actorRole: "staff",
        targetRole: "customer",
        objectLabel: null,
        offsetSeconds: 2,
        description: "Atendimento em andamento",
        zoneIds: ["balcao"],
        confidence: 0.9,
      },
    ],
    zones: [{ id: "balcao", personRoleHint: "shared" }],
  });

  assert.equal(result.operationalRole, "customer");
  assert.equal(result.engagedAtCounter, true);
});

test("Pesquisa IA recebe hora local e termos amigáveis", () => {
  const localized = localizeAssistantPayload(
    {
      at: "2026-08-08T13:03:00Z",
      status: "closed_by_inactivity",
    },
    "America/Sao_Paulo",
  ) as Record<string, string>;

  assert.match(localized.at, /08\/08\/2026, 10:03/);
  assert.match(localized.at, /horário da câmera/);
  assert.doesNotMatch(localized.at, /Z|UTC|T13/);
  assert.equal(
    localized.status,
    "encerrada após um período sem nova atividade",
  );
  assert.match(
    assistantPeriodLabel(
      "2026-08-08",
      "2026-08-08",
      "America/Sao_Paulo",
    ),
    /horário da câmera/,
  );
});

test("prompt v7 exige portão recorrente, passantes e veículo parado", () => {
  const prompt = buildVisionInstructions("detailed");
  assert.match(prompt, /primaryOperationalMarker/);
  assert.match(prompt, /passar na calçada/);
  assert.match(prompt, /veículo estacionado e imóvel/);
  assert.match(prompt, /service_continued/);
});

test("movimento estrutural do portão não é descartado como exposição", () => {
  assert.equal(
    isLikelyCameraNoise({
      changedPixelPercent: 18,
      meanAbsoluteDifference: 24,
      activeRegionCount: 5,
      motionSpreadPercent: 58,
      motionDensityPercent: 72,
      meanLuma: 96,
      meanLumaDelta: -18,
      directionalChangeRatio: 0.9,
    }),
    false,
  );
});

test("SQL da fase 13 separa aparições de pessoas distintas", async () => {
  const sql = await readFile(
    new URL(
      "../supabase/migrations/20260809190000_phase13_review_calibration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(sql, /engaged_at_counter/);
  assert.match(sql, /reconcile_event_people_memory_v2/);
  assert.match(sql, /reconcile_event_vehicle_memory_v2/);
  assert.match(sql, /qualifiedCustomerVisits/);
  assert.match(sql, /probableDistinctStaff/);
  assert.match(sql, /plateUsed', false/);
});

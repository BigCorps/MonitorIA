import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  operationalMomentContext,
} from "../agent/src/v103/operational-config.ts";
import {
  structuralContinueThreshold,
  structuralStartThreshold,
} from "../agent/src/v103/structural-motion.ts";

const access = {
  enabled: true,
  openingTime: "09:00",
  closingTime: "18:00",
  timezone: "America/Sao_Paulo",
  polygon: null,
  markerName: "Acesso",
  markerMinConfidence: 0.78,
};

test("horário é contexto: 03:00 continua monitorável e fica fora do expediente", () => {
  const context =
    operationalMomentContext(
      access,
      new Date("2026-08-27T06:00:00.000Z"),
      "America/Sao_Paulo",
    );

  assert.equal(context.enabled, true);
  assert.equal(context.outsideDeclaredHours, true);
  assert.equal(context.operationalPeriod, "outside_hours");
});

test("10:00 local é horário comercial", () => {
  const context =
    operationalMomentContext(
      access,
      new Date("2026-08-27T13:00:00.000Z"),
      "America/Sao_Paulo",
    );

  assert.equal(context.outsideDeclaredHours, false);
  assert.equal(context.operationalPeriod, "business_hours");
});

test("câmera com polígono operacional usa limiar estrutural menor que quadro inteiro", () => {
  const focused =
    structuralStartThreshold({
      configuredStartThreshold: 0.5,
      hasFocusPolygon: true,
      outsideDeclaredHours: false,
    });

  const full =
    structuralStartThreshold({
      configuredStartThreshold: 0.5,
      hasFocusPolygon: false,
      outsideDeclaredHours: false,
    });

  assert.ok(focused < full);
  assert.ok(
    structuralContinueThreshold(focused) <
      focused,
  );
});

test("migration impede visible_transition sem estado anterior auditável", async () => {
  const sql = await readFile(
    new URL(
      "../supabase/migrations/20260827143000_operational_visible_transition_guard_v103.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    sql,
    /previous_visible_state is null/,
  );
  assert.match(
    sql,
    /opening_precision := 'estimated_interval'/,
  );
  assert.match(
    sql,
    /closing_precision := 'estimated_interval'/,
  );
  assert.match(
    sql,
    /visual_observation_interval_v103/,
  );
});


test("runtime 1.0.3 reporta a própria versão no heartbeat", async () => {
  const runtime = await readFile(
    new URL(
      "../agent/src/v103/service-runtime.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    runtime,
    /version: AGENT_V103_VERSION/,
  );
  assert.match(
    runtime,
    /proto\.tickHeartbeat\s*=\s*tickHeartbeatV103/,
  );
});

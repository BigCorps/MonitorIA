import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  configuredMonitoriaModel,
  visionReasoningEffortForModel,
} from "../src/ai/model-policy";
import { resolveVisionRouteExecution } from "../src/vision/plans";

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("piloto Luna é isolado do produto padrão", () => {
  const oldStandard = process.env.MONITORIA_STANDARD_OPENAI_MODEL;
  const oldVip = process.env.MONITORIA_VIP_OPENAI_MODEL;
  delete process.env.MONITORIA_STANDARD_OPENAI_MODEL;
  delete process.env.MONITORIA_VIP_OPENAI_MODEL;
  try {
    assert.equal(configuredMonitoriaModel("standard"), "gpt-5-nano");
    assert.equal(configuredMonitoriaModel("vip"), "gpt-6-luna");
    assert.equal(
      resolveVisionRouteExecution("intensive", "strong", "standard").model,
      "gpt-5-nano",
    );
    assert.equal(
      resolveVisionRouteExecution("intensive", "strong", "vip").model,
      "gpt-6-luna",
    );
  } finally {
    if (oldStandard === undefined) delete process.env.MONITORIA_STANDARD_OPENAI_MODEL;
    else process.env.MONITORIA_STANDARD_OPENAI_MODEL = oldStandard;
    if (oldVip === undefined) delete process.env.MONITORIA_VIP_OPENAI_MODEL;
    else process.env.MONITORIA_VIP_OPENAI_MODEL = oldVip;
  }
});

test("Luna usa reasoning low e nano mantém minimal", () => {
  assert.equal(visionReasoningEffortForModel("gpt-6-luna"), "low");
  assert.equal(visionReasoningEffortForModel("gpt-5-nano"), "minimal");
});

test("visão, perfil e Pesquisa IA resolvem o track pelo Projeto VIP", async () => {
  const [gateway, provider, assistant] = await Promise.all([
    read("src/vision/inference-gateway.ts"),
    read("src/vision/openai-provider.ts"),
    read("src/assistant/openai.ts"),
  ]);

  assert.match(gateway, /resolveOrganizationAiTrack/);
  assert.match(provider, /resolveOrganizationAiTrack/);
  assert.match(assistant, /resolveOrganizationAiTrack/);
  assert.match(provider, /visionReasoningEffortForModel/);
});

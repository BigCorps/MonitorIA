import { installV102Runtime } from "./v102/service-runtime.js";
import { protectSecret, revealSecret } from "./secret-store.js";
import { AdaptiveMotionCalibration } from "./motion-calibration.js";
import { calculateMotion } from "./motion.js";
import { resolvePaths } from "./paths.js";
import { AGENT_V102_VERSION } from "./v102/version.js";

/**
 * O autoteste da 1.0.1 tratava 1,2% de alteração como amostra de repouso e
 * exigia que o adaptativo elevasse o threshold. Isso contradiz diretamente a
 * correção 1.0.2 que impede movimento real de virar baseline. A entrada oficial
 * executa este teste antes de importar a CLI legada.
 */
async function runV102SelfTest() {
  const sample = "MonitorIA 1.0.2 DPAPI autoteste: çã 🔐";
  const protectedValue = await protectSecret(sample);
  const restored = await revealSecret(protectedValue);
  if (restored.value !== sample) {
    throw new Error("O autoteste do cofre devolveu um valor diferente do original.");
  }

  const previous = Buffer.alloc(100, 0);
  const current = Buffer.alloc(100, 0);
  current.fill(255, 0, 25);
  const motion = calculateMotion(previous, current);
  if (Math.abs(motion.changedPixelPercent - 25) > 0.001) {
    throw new Error("O autoteste de movimento não calculou 25% de alteração.");
  }

  const mask = Buffer.alloc(100, 0);
  mask.fill(1, 0, 25);
  if (calculateMotion(previous, current, 20, mask).changedPixelPercent !== 0) {
    throw new Error("O autoteste da máscara de movimento falhou.");
  }

  const calibration = new AdaptiveMotionCalibration();
  for (let index = 0; index < 35; index += 1) calibration.observe(0.15, 1, true);
  const quiet = calibration.snapshot(1, 0.25, true);
  if (!quiet.ready || quiet.samples < 12 || quiet.p95 > 0.2) {
    throw new Error("O autoteste de repouso da calibração adaptativa falhou.");
  }

  // Movimento acima do teto de repouso não pode contaminar o baseline, mesmo
  // que algum chamador marque a amostra como elegível por engano.
  const beforeSamples = quiet.samples;
  for (let index = 0; index < 20; index += 1) calibration.observe(2.5, 1, true);
  const afterMovement = calibration.snapshot(1, 0.25, true);
  if (afterMovement.samples !== beforeSamples || afterMovement.effectiveStartThreshold > 1.1) {
    throw new Error("A calibração aprendeu movimento real como ruído.");
  }

  const layout = await resolvePaths();
  console.log(`Autoteste MonitorIA Agent v${AGENT_V102_VERSION} concluído com sucesso.`);
  console.log(`Pasta de dados: ${layout.root}`);
  console.log(`Permissões restritas: ${layout.restricted ? "sim" : "não"}`);
}

if ((process.argv[2]?.toLowerCase() ?? "status") === "self-test") {
  await runV102SelfTest();
} else {
  installV102Runtime();
  await import("./index.js");
}

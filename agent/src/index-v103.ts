import { installV102Runtime } from "./v102/service-runtime.js";
import {
  assertV102SchedulerInstalled,
  installV102Scheduler,
  useRuntimeHeartbeatForV102Scheduler,
  v102SchedulerContract,
} from "./v102/runtime-scheduler.js";
import {
  assertV103HostContract,
  V103_CORE_CONTRACT,
} from "./v103/runtime-contract.js";
import {
  installV103Runtime,
  v103RuntimeContract,
} from "./v103/service-runtime.js";
import { resolveAgentHostMode } from "./v103/host-mode.js";
import { installV103ClipIntegrity } from "./v103/clip-integrity.js";
import { installV103EarlyEvidencePinning } from "./v103/early-evidence-pinning.js";
import { installV103PriorityQueue } from "./v103/priority-queue.js";
import {
  installV103TimelineSegmentTiming,
  timelineSegmentTimingContractV103,
} from "./v103/timeline-segment-timing.js";
import { AGENT_V103_VERSION } from "./v103/version.js";

/**
 * Entrada oficial de desenvolvimento da 1.0.3.
 *
 * A base endurecida da 1.0.2 é instalada primeiro. Em seguida a camada 1.0.3
 * substitui somente o Core que precisa evoluir. O mesmo entrypoint compila
 * para Windows 24/7, Store Desktop e Linux.
 */
installV102Runtime();

// Deve entrar antes do early-pinning: o pinning encapsula captureAt(), então
// precisa enxergar a versão 1.0.3 que entende segmentos RTSP maiores que 3 s.
installV103TimelineSegmentTiming();
installV103EarlyEvidencePinning();
installV103PriorityQueue();
installV103ClipIntegrity();
installV103Runtime();

// A fila/retries continuam no scheduler homologado da 1.0.2, porém o
// heartbeat deve ser o do runtime que está realmente executando. Sem esta
// chave, o scheduler explícito chamava diretamente o heartbeat 1.0.2 e o
// backend continuava registrando 1.0.2 mesmo com o Core 1.0.3 instalado.
useRuntimeHeartbeatForV102Scheduler();
installV102Scheduler();

const command =
  process.argv[2]?.toLowerCase() ?? "status";
const hostMode =
  resolveAgentHostMode(command);
assertV103HostContract(hostMode);

if (command === "self-test") {
  assertV102SchedulerInstalled();

  const scheduler =
    v102SchedulerContract();
  const runtime =
    v103RuntimeContract();
  const timelineTiming =
    timelineSegmentTimingContractV103();

  if (
    scheduler.eventTransport !==
      "durable-v2" ||
    scheduler.eventEndpointPrefix !==
      "/api/agent/v2/cameras/" ||
    scheduler.heartbeatProfile !==
      "runtime" ||
    scheduler
      .legacyQueueAndHeartbeatTimersDisabled !==
      true ||
    scheduler
      .preservesLocalCameraStateOnRepair !==
      true
  ) {
    throw new Error(
      "A 1.0.3 perdeu uma garantia homologada da 1.0.2 ou não assumiu o heartbeat do runtime.",
    );
  }

  if (
    !V103_CORE_CONTRACT.invariants
      .oneFunctionalCore ||
    !V103_CORE_CONTRACT.invariants
      .linuxMustTrackCoreImprovements
  ) {
    throw new Error(
      "Contrato do Core compartilhado 1.0.3 inválido.",
    );
  }

  if (
    runtime.version !== "1.0.3" ||
    !runtime.slowStructuralDetector ||
    !runtime.linuxSharesRuntime ||
    !runtime.storeSharesRuntime
  ) {
    throw new Error(
      "Runtime operacional 1.0.3 incompleto.",
    );
  }

  if (
    !timelineTiming.variableGopWindow ||
    !timelineTiming.longSegmentSeekPreserved ||
    timelineTiming.extendedWaitMs < 15_000
  ) {
    throw new Error(
      "A 1.0.3 perdeu a correção de evidência para GOP/segmentos RTSP variáveis.",
    );
  }

  console.log(
    `Autoteste MonitorIA Agent v${AGENT_V103_VERSION} aprovado.`,
  );
  console.log(
    `Core: ${V103_CORE_CONTRACT.core}`,
  );
  console.log(
    `Host detectado: ${hostMode}`,
  );
  console.log(
    `Heartbeat do scheduler: ${scheduler.heartbeatProfile}`,
  );
  console.log(
    `Timeline RTSP variável: ${
      timelineTiming.variableGopWindow &&
      timelineTiming.longSegmentSeekPreserved
        ? "sim"
        : "não"
    }`,
  );
  console.log(
    `Detector estrutural lento: ${
      runtime.slowStructuralDetector
        ? "sim"
        : "não"
    }`,
  );
} else {
  await import("./index.js");
}

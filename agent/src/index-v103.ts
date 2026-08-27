import { installV102Runtime } from "./v102/service-runtime.js";
import {
  assertV102SchedulerInstalled,
  installV102Scheduler,
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
import { AGENT_V103_VERSION } from "./v103/version.js";

/**
 * Entrada oficial de desenvolvimento da 1.0.3.
 *
 * A base endurecida da 1.0.2 é instalada primeiro. Em seguida a camada 1.0.3
 * substitui somente o Core que precisa evoluir. O mesmo entrypoint compila
 * para Windows 24/7, Store Desktop e Linux.
 */
installV102Runtime();
installV103EarlyEvidencePinning();
installV103PriorityQueue();
installV103ClipIntegrity();
installV103Runtime();
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

  if (
    scheduler.eventTransport !==
      "durable-v2" ||
    scheduler.eventEndpointPrefix !==
      "/api/agent/v2/cameras/" ||
    scheduler
      .legacyQueueAndHeartbeatTimersDisabled !==
      true ||
    scheduler
      .preservesLocalCameraStateOnRepair !==
      true
  ) {
    throw new Error(
      "A 1.0.3 perdeu uma garantia homologada da 1.0.2.",
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
    `Detector estrutural lento: ${
      runtime.slowStructuralDetector
        ? "sim"
        : "não"
    }`,
  );
} else {
  await import("./index.js");
}

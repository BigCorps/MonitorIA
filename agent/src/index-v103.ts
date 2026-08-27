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
import { resolveAgentHostMode } from "./v103/host-mode.js";
import { AGENT_V103_VERSION } from "./v103/version.js";

/**
 * Fundação da 1.0.3.
 *
 * Nesta entrega o comportamento funcional continua herdando a base endurecida
 * da 1.0.2. O objetivo é impedir forks: Windows 24/7, Store e Linux devem
 * executar o mesmo Core nas próximas fases.
 */
installV102Runtime();
installV102Scheduler();

const command = process.argv[2]?.toLowerCase() ?? "status";
const hostMode = resolveAgentHostMode(command);
assertV103HostContract(hostMode);

if (command === "self-test") {
  assertV102SchedulerInstalled();
  const scheduler = v102SchedulerContract();

  if (
    scheduler.eventTransport !== "durable-v2" ||
    scheduler.eventEndpointPrefix !== "/api/agent/v2/cameras/" ||
    scheduler.legacyQueueAndHeartbeatTimersDisabled !== true ||
    scheduler.preservesLocalCameraStateOnRepair !== true
  ) {
    throw new Error("A 1.0.3 perdeu uma garantia homologada da 1.0.2.");
  }

  if (!V103_CORE_CONTRACT.invariants.oneFunctionalCore) {
    throw new Error("A 1.0.3 precisa manter um único Core.");
  }

  if (!V103_CORE_CONTRACT.invariants.linuxMustTrackCoreImprovements) {
    throw new Error("Linux precisa acompanhar o Core 1.0.3.");
  }

  console.log(
    `Autoteste de fundação MonitorIA Agent v${AGENT_V103_VERSION} aprovado.`,
  );
  console.log(`Core: ${V103_CORE_CONTRACT.core}`);
  console.log(`Host detectado: ${hostMode}`);
} else {
  await import("./index.js");
}

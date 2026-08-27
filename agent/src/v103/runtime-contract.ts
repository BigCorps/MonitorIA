import { AGENT_V103_VERSION } from "./version.js";
import { hostCapabilities, type AgentHostMode } from "./host-mode.js";

export const V103_CORE_CONTRACT = Object.freeze({
  version: AGENT_V103_VERSION,
  core: "shared-core-v103",
  inheritedStableRuntime: "v102-hardened",
  requiredHosts: [
    "windows-service",
    "windows-desktop",
    "linux-systemd",
  ] as const,
  invariants: {
    oneFunctionalCore: true,
    linuxMustTrackCoreImprovements: true,
    storeMustNotRequireNtService: true,
    windows247MayUseNtService: true,
    linuxUsesSystemd: true,
  },
});

export function assertV103HostContract(mode: AgentHostMode) {
  const capabilities = hostCapabilities(mode);

  if (!capabilities.sharedCore) {
    throw new Error("Host 1.0.3 fora do Core compartilhado.");
  }

  if (mode === "windows-desktop" && capabilities.ntService) {
    throw new Error("A edição Store não pode depender de NT Service.");
  }

  if (mode === "linux-systemd" && !capabilities.systemd) {
    throw new Error("O host Linux 1.0.3 deve permanecer sob systemd.");
  }

  return capabilities;
}

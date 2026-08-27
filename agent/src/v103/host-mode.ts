export type AgentHostMode =
  | "windows-service"
  | "windows-desktop"
  | "linux-systemd"
  | "foreground";

export type HostCapabilities = {
  mode: AgentHostMode;
  sharedCore: true;
  startsBeforeInteractiveLogin: boolean;
  trayRequired: boolean;
  ntService: boolean;
  systemd: boolean;
};

export function resolveAgentHostMode(
  command: string | undefined,
  platform: NodeJS.Platform = process.platform,
): AgentHostMode {
  const normalized = (command ?? "status").toLowerCase();

  if (normalized === "service") {
    return platform === "win32" ? "windows-service" : "linux-systemd";
  }

  if (normalized === "run" && platform === "win32") {
    return "windows-desktop";
  }

  return "foreground";
}

export function hostCapabilities(mode: AgentHostMode): HostCapabilities {
  if (mode === "windows-service") {
    return {
      mode,
      sharedCore: true,
      startsBeforeInteractiveLogin: true,
      trayRequired: true,
      ntService: true,
      systemd: false,
    };
  }

  if (mode === "windows-desktop") {
    return {
      mode,
      sharedCore: true,
      startsBeforeInteractiveLogin: false,
      trayRequired: true,
      ntService: false,
      systemd: false,
    };
  }

  if (mode === "linux-systemd") {
    return {
      mode,
      sharedCore: true,
      startsBeforeInteractiveLogin: true,
      trayRequired: false,
      ntService: false,
      systemd: true,
    };
  }

  return {
    mode,
    sharedCore: true,
    startsBeforeInteractiveLogin: false,
    trayRequired: false,
    ntService: false,
    systemd: false,
  };
}

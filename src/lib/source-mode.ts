export type VisualSourceKind =
  | "live_camera"
  | "local_recording";

export type OrganizationSourceMode =
  | "empty"
  | "recordings_only"
  | "live_only"
  | "hybrid";

export type OrganizationSourceContext = {
  mode: OrganizationSourceMode;
  liveCameraCount: number;
  recordingEnvironmentCount: number;
  liveOnlineCount: number;
  agentCount: number;
  agentOnlineCount: number;
};

export const EMPTY_SOURCE_CONTEXT: OrganizationSourceContext = {
  mode: "empty",
  liveCameraCount: 0,
  recordingEnvironmentCount: 0,
  liveOnlineCount: 0,
  agentCount: 0,
  agentOnlineCount: 0,
};

export function sourceModeFromCounts(
  liveCameraCount: number,
  recordingEnvironmentCount: number,
): OrganizationSourceMode {
  if (liveCameraCount > 0 && recordingEnvironmentCount > 0) {
    return "hybrid";
  }

  if (liveCameraCount > 0) return "live_only";
  if (recordingEnvironmentCount > 0) return "recordings_only";
  return "empty";
}

export function sourceCollectionLabel(
  mode: OrganizationSourceMode,
) {
  if (mode === "recordings_only") return "Ambientes";
  if (mode === "hybrid") return "Fontes";
  return "Câmeras";
}

export function allSourcesLabel(
  mode: OrganizationSourceMode,
) {
  if (mode === "recordings_only") return "Todos os ambientes";
  if (mode === "hybrid") return "Todas as fontes";
  return "Todas as câmeras";
}

import type {
  TrialReadiness,
  TrialReadinessReason,
  TrialStatus,
} from "@/src/trial/types";

export function trialStatusLabel(status: TrialStatus) {
  const labels: Record<TrialStatus, string> = {
    draft: "Configuração pendente",
    ready: "Pronto para iniciar",
    running: "Análise em andamento",
    capture_completed: "Coleta concluída",
    exploration: "Período de exploração",
    converted: "Serviço contratado",
    expired: "Teste encerrado",
    purged: "Dados do teste removidos",
  };

  return labels[status];
}

export function trialStatusTone(status: TrialStatus) {
  if (status === "running") return "running" as const;
  if (status === "ready") return "ready" as const;
  if (status === "converted") return "converted" as const;
  if (status === "expired" || status === "purged") {
    return "expired" as const;
  }
  return "neutral" as const;
}

export function readinessReasonLabel(
  reason: TrialReadinessReason,
) {
  const labels: Record<string, string> = {
    camera_not_found: "A câmera não foi encontrada.",
    camera_offline: "A câmera precisa estar online.",
    camera_not_paired: "Conclua o pareamento da câmera.",
    active_profile_required:
      "Aprove o perfil inteligente da câmera.",
    agent_camera_not_enabled:
      "Ative a câmera no MonitorIA Agent.",
    agent_offline: "Abra o MonitorIA Agent no computador.",
    agent_heartbeat_stale:
      "O Agent não envia sinal há alguns minutos. Inicie-o novamente.",
  };

  return labels[reason] ?? "Existe uma pendência na configuração.";
}

export function readinessItems(readiness: TrialReadiness) {
  return [
    {
      id: "camera-online",
      label: "Câmera online",
      complete: readiness.cameraOnline,
    },
    {
      id: "camera-paired",
      label: "Câmera pareada",
      complete: readiness.cameraPaired,
    },
    {
      id: "active-profile",
      label: "Perfil inteligente aprovado",
      complete: readiness.activeProfile,
    },
    {
      id: "agent-enabled",
      label: "Câmera ativa no Agent",
      complete: readiness.agentCameraEnabled,
    },
    {
      id: "agent-online",
      label: "Agent conectado recentemente",
      complete:
        readiness.agentOnline && readiness.agentHeartbeatRecent,
    },
  ];
}

export function effectiveTrialStatus(input: {
  status: TrialStatus;
  captureEndsAt: string | null;
  explorationEndsAt: string | null;
}, now = Date.now()): TrialStatus {
  if (input.status === "converted" || input.status === "purged") {
    return input.status;
  }

  const captureEnd = input.captureEndsAt
    ? new Date(input.captureEndsAt).getTime()
    : Number.POSITIVE_INFINITY;
  const explorationEnd = input.explorationEndsAt
    ? new Date(input.explorationEndsAt).getTime()
    : Number.POSITIVE_INFINITY;

  if (
    (input.status === "running" ||
      input.status === "capture_completed" ||
      input.status === "exploration") &&
    Number.isFinite(explorationEnd) &&
    explorationEnd <= now
  ) {
    return "expired";
  }

  if (
    input.status === "running" &&
    Number.isFinite(captureEnd) &&
    captureEnd <= now
  ) {
    return "exploration";
  }

  if (input.status === "capture_completed") {
    return "exploration";
  }

  return input.status;
}

export function secondsUntil(value: string | null, now = Date.now()) {
  if (!value) return 0;
  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.floor((target - now) / 1000));
}

export function formatCountdown(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor((safe % 86_400) / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const seconds = safe % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(
      minutes,
    ).padStart(2, "0")}min`;
  }

  return `${String(hours).padStart(2, "0")}:${String(
    minutes,
  ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatTrialDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

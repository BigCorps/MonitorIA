export type CameraProductStatus =
  | "connecting"
  | "needs_configuration"
  | "ready_to_monitor"
  | "monitoring"
  | "attention_required"
  | "offline";

export type CameraProductExperience = "standard" | "vip";

export type CameraChecklistKey =
  | "agent"
  | "image"
  | "plan"
  | "profile"
  | "monitor"
  | "pipeline";

export type CameraProductChecklistItem = {
  key: CameraChecklistKey;
  label: string;
  complete: boolean;
  applicable: boolean;
  warning: boolean;
};

export type CameraProductInput = {
  id: string;
  name: string;
  siteId: string;
  siteName: string;
  sourceKind: "live_camera" | "local_recording";
  cameraOnline: boolean;
  cameraPaired: boolean;
  imageReceived: boolean;
  planReady: boolean;
  planCode: string | null;
  profileReady: boolean;
  agentMapped: boolean;
  agentEnabled: boolean;
  agentOnline: boolean;
  agentHeartbeatRecent: boolean;
  monitorActive: boolean;
  pipelineIssue: boolean;
  visualHealthStatus: string | null;
  latestAnalysisAt: string | null;
  latestImageAt: string | null;
};

export type CameraProductState = CameraProductInput & {
  status: CameraProductStatus;
  label: string;
  description: string;
  remainingSteps: number;
  checklist: CameraProductChecklistItem[];
  action: {
    label: string;
    href: string;
  };
};

function liveAgentReady(input: CameraProductInput) {
  return (
    input.agentMapped &&
    input.agentEnabled &&
    input.agentOnline &&
    input.agentHeartbeatRecent
  );
}

function requiredChecklist(input: CameraProductInput) {
  const live = input.sourceKind === "live_camera";

  return [
    {
      key: "agent",
      label: "Computador conectado",
      complete: live ? liveAgentReady(input) : true,
      applicable: live,
      warning: live && input.agentMapped && !liveAgentReady(input),
    },
    {
      key: "image",
      label: live ? "Imagem recebida" : "Arquivo disponível",
      complete: input.imageReceived,
      applicable: true,
      warning: false,
    },
    {
      key: "plan",
      label: input.planCode
        ? `Plano ${input.planCode === "intensive" ? "Intensive" : input.planCode}`
        : "Plano liberado",
      complete: input.planReady,
      applicable: true,
      warning: false,
    },
    {
      key: "profile",
      label: "Perfil inteligente",
      complete: input.profileReady,
      applicable: true,
      warning: false,
    },
    {
      key: "monitor",
      label: live ? "Monitoramento iniciado" : "Análise disponível",
      complete: live ? input.monitorActive : input.planReady && input.profileReady,
      applicable: true,
      warning: live && input.pipelineIssue,
    },
    {
      key: "pipeline",
      label: "Monitoramento saudável",
      complete: !input.pipelineIssue,
      applicable: live && input.monitorActive,
      warning: input.pipelineIssue,
    },
  ] satisfies CameraProductChecklistItem[];
}

function standardAction(
  input: CameraProductInput,
  status: CameraProductStatus,
): CameraProductState["action"] {
  if (!input.profileReady) {
    return {
      label: "Concluir configuração",
      href: `/dashboard/cameras/${encodeURIComponent(input.id)}?setup=guided#perfil-inteligente`,
    };
  }

  if (!input.planReady) {
    return {
      label: "Concluir ativação",
      href: "/dashboard/commercial-choice",
    };
  }

  if (status === "offline") {
    return {
      label: "Reconectar computador",
      href: "/dashboard/installer",
    };
  }

  if (status === "attention_required") {
    return {
      label: "Ver diagnóstico",
      href: `/dashboard/cameras?camera=${encodeURIComponent(input.id)}#saude`,
    };
  }

  if (status === "ready_to_monitor") {
    return {
      label:
        input.sourceKind === "local_recording"
          ? "Começar análise"
          : "Verificar monitoramento",
      href:
        input.sourceKind === "local_recording"
          ? `/dashboard/recordings?source=${encodeURIComponent(input.id)}`
          : `/dashboard/cameras/${encodeURIComponent(input.id)}?setup=guided#perfil-inteligente`,
    };
  }

  if (status === "connecting") {
    return {
      label: "Continuar configuração",
      href: "/dashboard/cameras/connections",
    };
  }

  return {
    label: "Abrir câmera",
    href: `/dashboard/cameras/${encodeURIComponent(input.id)}`,
  };
}

function vipAction(
  input: CameraProductInput,
  status: CameraProductStatus,
): CameraProductState["action"] {
  if (!input.profileReady) {
    return {
      label: "Concluir configuração",
      href: `/vip/onboarding?camera=${encodeURIComponent(input.id)}#camera-setup`,
    };
  }

  if (!input.planReady) {
    return {
      label: "Concluir ativação",
      href: "/vip/onboarding",
    };
  }

  if (status === "offline") {
    return {
      label: "Reconectar computador",
      href: "/vip/onboarding",
    };
  }

  if (status === "attention_required") {
    return {
      label: "Ver diagnóstico",
      href: `/vip/dashboard?camera=${encodeURIComponent(input.id)}#saude`,
    };
  }

  if (status === "ready_to_monitor") {
    return {
      label:
        input.sourceKind === "local_recording"
          ? "Começar análise"
          : "Verificar ativação",
      href: `/vip/onboarding?camera=${encodeURIComponent(input.id)}#camera-setup`,
    };
  }

  if (status === "connecting") {
    return {
      label: "Continuar configuração",
      href: "/vip/onboarding",
    };
  }

  return {
    label: "Abrir câmera",
    href: `/dashboard/cameras/${encodeURIComponent(input.id)}`,
  };
}

function actionFor(
  input: CameraProductInput,
  status: CameraProductStatus,
  experience: CameraProductExperience,
) {
  return experience === "vip"
    ? vipAction(input, status)
    : standardAction(input, status);
}

export function deriveCameraProductState(
  input: CameraProductInput,
  options: { experience?: CameraProductExperience } = {},
): CameraProductState {
  const experience = options.experience ?? "standard";
  const live = input.sourceKind === "live_camera";
  const agentReady = liveAgentReady(input);
  let status: CameraProductStatus;

  if (
    live &&
    input.cameraPaired &&
    input.agentMapped &&
    input.agentEnabled &&
    (!input.cameraOnline || !input.agentOnline || !input.agentHeartbeatRecent)
  ) {
    status = "offline";
  } else if (
    (live && (!input.cameraPaired || !input.agentMapped || !input.agentEnabled)) ||
    !input.imageReceived
  ) {
    status = "connecting";
  } else if (!input.planReady || !input.profileReady) {
    status = "needs_configuration";
  } else if (live && input.pipelineIssue) {
    status = "attention_required";
  } else if (live && (!input.cameraOnline || !agentReady)) {
    status = "offline";
  } else if (live && !input.monitorActive) {
    status = "ready_to_monitor";
  } else if (!live) {
    status = "ready_to_monitor";
  } else {
    status = "monitoring";
  }

  const copy: Record<
    CameraProductStatus,
    { label: string; description: string }
  > = {
    connecting: {
      label: "Conectando",
      description:
        "A câmera ou o computador ainda está terminando a conexão. O MonitorIA continua verificando automaticamente.",
    },
    needs_configuration: {
      label: "Precisa concluir configuração",
      description: !input.profileReady
        ? "A imagem já está disponível. Falta concluir o perfil inteligente para começar a analisar."
        : "A câmera está configurada, mas ainda falta liberar o monitoramento.",
    },
    ready_to_monitor: {
      label:
        input.sourceKind === "local_recording"
          ? "Pronta para analisar"
          : "Pronta para monitorar",
      description:
        input.sourceKind === "local_recording"
          ? "O arquivo e o perfil estão prontos. Você já pode iniciar a análise."
          : "Conexão, plano e perfil estão prontos. Falta confirmar que o monitoramento foi iniciado.",
    },
    monitoring: {
      label: "Monitorando",
      description:
        "A câmera está conectada, configurada e com o monitoramento ativo.",
    },
    attention_required: {
      label: "Atenção necessária",
      description:
        "A câmera continua conectada, mas há sinal de que o monitoramento precisa ser verificado.",
    },
    offline: {
      label: "Offline",
      description:
        "O computador responsável ou a câmera deixou de enviar sinal recente.",
    },
  };

  const checklist = requiredChecklist(input);
  const remainingSteps = checklist.filter(
    (item) => item.applicable && !item.complete,
  ).length;

  return {
    ...input,
    status,
    ...copy[status],
    remainingSteps,
    checklist,
    action: actionFor(input, status, experience),
  };
}

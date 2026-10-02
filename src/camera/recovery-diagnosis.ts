import type {
  CameraProductExperience,
  CameraProductState,
} from "./product-state";

export type CameraRecoveryArea =
  | "none"
  | "agent"
  | "camera"
  | "plan"
  | "profile"
  | "monitor"
  | "pipeline";

export type CameraRecoveryTone = "ok" | "info" | "attention" | "critical";

export type CameraRecoveryIssue =
  | "healthy"
  | "recording_ready"
  | "inconsistent_state"
  | "pairing_incomplete"
  | "agent_offline"
  | "camera_error"
  | "camera_offline"
  | "first_image_pending"
  | "plan_pending"
  | "profile_pending"
  | "visual_health"
  | "pipeline_gap"
  | "monitor_pending";

export type CameraRecoveryAction = {
  label: string;
  href: string;
};

export type CameraRecoverySignal = {
  key: "heartbeat" | "image" | "analysis" | "monitor" | "queue" | "agent";
  label: string;
  value: string;
  tone: "ok" | "muted" | "warning";
};

export type CameraRecoveryTelemetry = {
  cameraLastSeenAt: string | null;
  agentLastHeartbeatAt: string | null;
  monitorStartedAt: string | null;
  latestGapAt: string | null;
  latestCameraErrorCode: string | null;
  latestCameraErrorAt: string | null;
  agentQueuePending: number | null;
  agentDiskFreeBytes: number | null;
  agentVersion: string | null;
  mappedAgentName: string | null;
  mappedAgentStatus: string | null;
  enabledMappingCount: number;
};

export type CameraRecoveryDiagnostic = {
  issue: CameraRecoveryIssue;
  area: CameraRecoveryArea;
  areaLabel: string;
  tone: CameraRecoveryTone;
  title: string;
  summary: string;
  signals: CameraRecoverySignal[];
  inconsistencies: string[];
  automaticRecovery: string | null;
  primaryAction: CameraRecoveryAction | null;
  secondaryAction: CameraRecoveryAction | null;
};

const AREA_LABELS: Record<CameraRecoveryArea, string> = {
  none: "Tudo certo",
  agent: "Computador / Agent",
  camera: "Câmera",
  plan: "Plano",
  profile: "Perfil",
  monitor: "Monitor local",
  pipeline: "Processamento",
};

function dateMs(value: string | null) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function recent(value: string | null, minutes: number, now: number) {
  const timestamp = dateMs(value);
  return timestamp > 0 && now - timestamp <= minutes * 60_000;
}

function timeLabel(value: string | null, now: number) {
  const timestamp = dateMs(value);
  if (!timestamp) return "sem registro";
  const elapsed = Math.max(0, now - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 2) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

function queueLabel(value: number | null) {
  if (value === null) return "sem leitura";
  if (value === 0) return "fila vazia";
  return value === 1 ? "1 evento aguardando" : `${value} eventos aguardando`;
}

function routeFor(
  input: CameraProductState,
  experience: CameraProductExperience,
  kind:
    | "camera"
    | "discovery"
    | "installer"
    | "plan"
    | "profile"
    | "health",
) {
  const id = encodeURIComponent(input.id);

  if (kind === "camera") return `/dashboard/cameras/${id}`;
  if (kind === "health") return `/dashboard/camera-health?camera=${id}`;

  if (experience === "vip") {
    if (kind === "discovery" || kind === "installer" || kind === "plan") {
      return "/vip/onboarding";
    }
    if (kind === "profile") return `/vip/onboarding?camera=${id}#camera-setup`;
  }

  if (kind === "discovery") return "/dashboard/cameras/discovery";
  if (kind === "installer") return "/dashboard/installer/pair";
  if (kind === "plan") return "/dashboard/commercial-choice";
  return `/dashboard/cameras/${id}?setup=guided#perfil-inteligente`;
}

type FailureGuidance = {
  title: string;
  summary: string;
  retryable: boolean;
  actionKind: "discovery" | "camera";
};

function failureGuidance(code: string | null): FailureGuidance | null {
  if (!code) return null;

  const guidance: Record<string, FailureGuidance> = {
    rtsp_unauthorized: {
      title: "A câmera recusou o usuário ou a senha",
      summary:
        "O computador está comunicando com o MonitorIA, mas esta câmera rejeitou as credenciais de vídeo. Faça uma nova busca com o usuário e a senha corretos.",
      retryable: false,
      actionKind: "discovery",
    },
    rtsp_forbidden: {
      title: "A conta da câmera não tem permissão para o vídeo",
      summary:
        "A câmera respondeu, porém o usuário configurado não pode abrir o stream. Confira a permissão RTSP/streaming no equipamento e faça a busca novamente.",
      retryable: false,
      actionKind: "discovery",
    },
    rtsp_path_not_found: {
      title: "O caminho de vídeo salvo não existe mais",
      summary:
        "O equipamento respondeu, mas o stream usado anteriormente não foi encontrado. Uma nova descoberta é o caminho seguro para localizar o stream válido sem alterar a câmera automaticamente.",
      retryable: false,
      actionKind: "discovery",
    },
    rtsp_too_many_clients: {
      title: "A câmera atingiu o limite de conexões",
      summary:
        "O Agent está ativo, mas a câmera não aceitou outra conexão. Feche visualizações abertas no aplicativo do fabricante ou DVR e aguarde a próxima tentativa automática.",
      retryable: true,
      actionKind: "camera",
    },
    rtsp_refused: {
      title: "A câmera está recusando a conexão de vídeo",
      summary:
        "O computador alcança a rede, mas a porta de vídeo foi recusada. Confira se RTSP está habilitado e use a descoberta novamente se a configuração do equipamento mudou.",
      retryable: true,
      actionKind: "discovery",
    },
    rtsp_unreachable: {
      title: "O Agent não consegue alcançar esta câmera",
      summary:
        "O computador responsável está online, porém a câmera não respondeu na rede. Confira energia, cabo/Wi-Fi e o roteador deste Local.",
      retryable: true,
      actionKind: "discovery",
    },
    rtsp_unsupported_stream: {
      title: "O formato de vídeo não pôde ser lido",
      summary:
        "A câmera respondeu, mas o stream atual não é compatível com a captura. Prefira H.264/substream no equipamento e faça uma nova busca.",
      retryable: false,
      actionKind: "discovery",
    },
    rtsp_capture_failed: {
      title: "O vídeo desta câmera não abriu nesta tentativa",
      summary:
        "O Agent encontrou uma falha de captura sem causa específica. O MonitorIA continuará tentando; se persistir, refaça a descoberta desta câmera.",
      retryable: true,
      actionKind: "discovery",
    },
  };

  return guidance[code] ?? null;
}

function inconsistencyList(
  input: CameraProductState,
  telemetry: CameraRecoveryTelemetry,
  now: number,
) {
  if (input.sourceKind !== "live_camera") return [];
  const inconsistencies: string[] = [];

  if (telemetry.enabledMappingCount > 1) {
    inconsistencies.push(
      "Mais de um vínculo de Agent está habilitado para a mesma câmera.",
    );
  }

  if (input.monitorActive && (!input.agentMapped || !input.agentEnabled)) {
    inconsistencies.push(
      "Existe uma sessão de monitoramento aberta, mas o vínculo ativo com o Agent não está confirmado.",
    );
  }

  if (input.monitorActive && !input.agentHeartbeatRecent) {
    inconsistencies.push(
      "O servidor ainda registra uma sessão de monitoramento, mas o computador responsável deixou de enviar heartbeat recente.",
    );
  }

  if (input.cameraOnline && !input.cameraPaired) {
    inconsistencies.push(
      "A câmera está marcada como online, embora o pareamento não esteja concluído.",
    );
  }

  if (input.agentOnline && !input.agentHeartbeatRecent) {
    inconsistencies.push(
      "O Agent ainda está marcado como online, mas o heartbeat já ficou antigo.",
    );
  }

  if (
    input.cameraOnline &&
    telemetry.cameraLastSeenAt &&
    !recent(telemetry.cameraLastSeenAt, 12, now)
  ) {
    inconsistencies.push(
      "A câmera ainda está marcada como online, mas o último sinal dela já ficou antigo.",
    );
  }

  if (
    telemetry.mappedAgentStatus === "disabled" &&
    telemetry.enabledMappingCount > 0
  ) {
    inconsistencies.push(
      "Há um vínculo habilitado apontando para um Agent desativado.",
    );
  }

  return inconsistencies;
}

function signals(
  input: CameraProductState,
  telemetry: CameraRecoveryTelemetry,
  now: number,
): CameraRecoverySignal[] {
  const live = input.sourceKind === "live_camera";
  const heartbeatOk = live && input.agentHeartbeatRecent;
  const imageOk = input.imageReceived;
  const analysisOk = Boolean(input.latestAnalysisAt);

  return [
    {
      key: "heartbeat",
      label: "Último heartbeat",
      value: live ? timeLabel(telemetry.agentLastHeartbeatAt, now) : "não se aplica",
      tone: live ? (heartbeatOk ? "ok" : "warning") : "muted",
    },
    {
      key: "image",
      label: input.sourceKind === "local_recording" ? "Arquivo / imagem" : "Última imagem",
      value: timeLabel(input.latestImageAt, now),
      tone: imageOk ? "ok" : "warning",
    },
    {
      key: "analysis",
      label: "Última análise",
      value: timeLabel(input.latestAnalysisAt, now),
      tone: analysisOk ? "ok" : "muted",
    },
    {
      key: "monitor",
      label: live ? "Monitor local" : "Análise",
      value: live
        ? input.monitorActive
          ? telemetry.monitorStartedAt
            ? `ativo desde ${timeLabel(telemetry.monitorStartedAt, now)}`
            : "ativo"
          : "não confirmado"
        : input.planReady && input.profileReady
          ? "pronta"
          : "aguardando configuração",
      tone: live
        ? input.monitorActive
          ? "ok"
          : "warning"
        : input.planReady && input.profileReady
          ? "ok"
          : "muted",
    },
    {
      key: "queue",
      label: "Fila do Agent",
      value: live ? queueLabel(telemetry.agentQueuePending) : "não se aplica",
      tone:
        live && telemetry.agentQueuePending !== null && telemetry.agentQueuePending > 0
          ? "warning"
          : live
            ? "ok"
            : "muted",
    },
    {
      key: "agent",
      label: "Versão do Agent",
      value: live ? telemetry.agentVersion ?? "sem leitura" : "não se aplica",
      tone: live ? "muted" : "muted",
    },
  ];
}

export function deriveCameraRecoveryDiagnostic(
  input: CameraProductState,
  telemetry: CameraRecoveryTelemetry,
  options: {
    experience?: CameraProductExperience;
    nowMs?: number;
  } = {},
): CameraRecoveryDiagnostic {
  const experience = options.experience ?? "standard";
  const now = options.nowMs ?? Date.now();
  const inconsistencies = inconsistencyList(input, telemetry, now);
  const signalList = signals(input, telemetry, now);
  const failure = failureGuidance(telemetry.latestCameraErrorCode);

  const result = (
    issue: CameraRecoveryIssue,
    area: CameraRecoveryArea,
    tone: CameraRecoveryTone,
    title: string,
    summary: string,
    automaticRecovery: string | null,
    primaryAction: CameraRecoveryAction | null,
    secondaryAction: CameraRecoveryAction | null = null,
  ): CameraRecoveryDiagnostic => ({
    issue,
    area,
    areaLabel: AREA_LABELS[area],
    tone,
    title,
    summary,
    signals: signalList,
    inconsistencies,
    automaticRecovery,
    primaryAction,
    secondaryAction,
  });

  if (input.sourceKind === "local_recording") {
    if (!input.planReady) {
      return result(
        "plan_pending",
        "plan",
        "info",
        "O arquivo está disponível; falta liberar a análise",
        "A fonte não depende de Agent. A próxima etapa é somente comercial.",
        null,
        { label: "Concluir ativação", href: routeFor(input, experience, "plan") },
      );
    }
    if (!input.profileReady) {
      return result(
        "profile_pending",
        "profile",
        "info",
        "Falta concluir o perfil inteligente",
        "O arquivo já está disponível e o plano está liberado. Aprove o contexto que orienta a análise.",
        null,
        { label: "Concluir configuração", href: routeFor(input, experience, "profile") },
      );
    }
    return result(
      "recording_ready",
      "none",
      "ok",
      "Fonte pronta para análise",
      "Esta fonte é uma gravação local e não depende de heartbeat ou monitor contínuo.",
      null,
      { label: "Abrir câmera", href: routeFor(input, experience, "camera") },
    );
  }

  if (inconsistencies.length > 0) {
    const agentProblem =
      !input.agentHeartbeatRecent ||
      telemetry.mappedAgentStatus === "disabled" ||
      telemetry.enabledMappingCount > 1;

    return result(
      "inconsistent_state",
      agentProblem ? "agent" : "monitor",
      "attention",
      "Os sinais desta câmera não estão concordando",
      "O MonitorIA encontrou estados que deveriam acompanhar um ao outro, mas chegaram em combinações diferentes. Nenhum dado será alterado automaticamente para esconder essa divergência.",
      "O painel continuará atualizando os sinais recebidos. Se o Agent voltar a reportar normalmente, a inconsistência desaparece sem intervenção no cadastro.",
      {
        label: agentProblem ? "Ver instalação / reparo" : "Abrir câmera",
        href: routeFor(input, experience, agentProblem ? "installer" : "camera"),
      },
      { label: "Baixar diagnóstico de suporte", href: "/api/support/diagnostics" },
    );
  }

  if (!input.cameraPaired || !input.agentMapped || !input.agentEnabled) {
    const historicalDisabledAgent = telemetry.mappedAgentStatus === "disabled";
    return result(
      "pairing_incomplete",
      "agent",
      "attention",
      historicalDisabledAgent
        ? "A câmera ainda aponta para um computador desativado"
        : "O vínculo entre câmera e computador está incompleto",
      historicalDisabledAgent
        ? "O cadastro da câmera foi preservado, mas o Agent que a atendia foi desativado. Repareie o computador e use a descoberta para reassociar sem recriar o histórico."
        : "A câmera existe na conta, porém não há um vínculo ativo e utilizável com o Agent deste Local.",
      null,
      {
        label: historicalDisabledAgent ? "Trocar ou reparar computador" : "Procurar câmera",
        href: routeFor(input, experience, historicalDisabledAgent ? "installer" : "discovery"),
      },
      { label: "Abrir câmera", href: routeFor(input, experience, "camera") },
    );
  }

  if (!input.agentOnline || !input.agentHeartbeatRecent) {
    return result(
      "agent_offline",
      "agent",
      "critical",
      "O problema está no computador responsável",
      `A câmera continua cadastrada, mas o Agent${telemetry.mappedAgentName ? ` “${telemetry.mappedAgentName}”` : ""} não enviou heartbeat recente.`,
      "Quando o Agent voltar a autenticar e sincronizar, o MonitorIA retoma a configuração existente sem apagar a câmera.",
      { label: "Ver instalação / reparo", href: routeFor(input, experience, "installer") },
      { label: "Abrir câmera", href: routeFor(input, experience, "camera") },
    );
  }

  if (telemetry.latestCameraErrorCode === "continuous_monitor_failed" && !input.monitorActive) {
    return result(
      "monitor_pending",
      "monitor",
      "attention",
      "O monitor local desta câmera registrou uma falha",
      "O Agent continua online e a câmera permanece cadastrada, mas a última falha registrada pertence ao monitor contínuo, não ao plano ou ao perfil.",
      "O Agent continua sincronizando e verificando a câmera. Este Gate observa o resultado e não força restart do runtime local.",
      { label: "Abrir câmera", href: routeFor(input, experience, "camera") },
      { label: "Baixar diagnóstico de suporte", href: "/api/support/diagnostics" },
    );
  }

  if (failure && (!input.cameraOnline || !input.imageReceived || !input.monitorActive)) {
    return result(
      "camera_error",
      "camera",
      failure.retryable ? "attention" : "critical",
      failure.title,
      failure.summary,
      failure.retryable
        ? "O Agent 1.0.3 já usa novas tentativas com intervalo progressivo. Em falhas repetidas de rede, ele também tenta reencontrar a câmera quando o endereço local mudou."
        : "Repetir sem corrigir a causa não costuma resolver este tipo de falha; por isso o painel orienta a configuração em vez de forçar um restart.",
      {
        label:
          failure.actionKind === "discovery" ? "Refazer descoberta" : "Abrir câmera",
        href: routeFor(input, experience, failure.actionKind),
      },
      { label: "Funcionamento da câmera", href: routeFor(input, experience, "health") },
    );
  }

  if (!input.cameraOnline) {
    return result(
      "camera_offline",
      "camera",
      "attention",
      "O computador está online, mas esta câmera não responde",
      "O problema está isolado da conexão do Agent. Confira alimentação, rede local e disponibilidade do stream desta câmera.",
      "O Agent 1.0.3 volta a testar câmeras que falham e usa backoff para não criar um loop agressivo de tentativas.",
      { label: "Procurar câmera novamente", href: routeFor(input, experience, "discovery") },
      { label: "Funcionamento da câmera", href: routeFor(input, experience, "health") },
    );
  }

  if (!input.imageReceived) {
    return result(
      "first_image_pending",
      "camera",
      "info",
      "A conexão existe, mas ainda falta a primeira imagem",
      "O servidor recebeu sinal da câmera, porém ainda não existe uma imagem real armazenada para confirmar a captura.",
      "Depois da descoberta, o Agent antecipa a primeira captura e mantém a verificação periódica como fallback.",
      { label: "Abrir câmera", href: routeFor(input, experience, "camera") },
      { label: "Refazer descoberta", href: routeFor(input, experience, "discovery") },
    );
  }

  if (!input.planReady) {
    return result(
      "plan_pending",
      "plan",
      "info",
      "A parte técnica está pronta; falta liberar o plano",
      "Computador, câmera e imagem já estão disponíveis. O bloqueio atual é de entitlement, não de conexão.",
      null,
      { label: "Concluir ativação", href: routeFor(input, experience, "plan") },
      { label: "Abrir câmera", href: routeFor(input, experience, "camera") },
    );
  }

  if (!input.profileReady) {
    return result(
      "profile_pending",
      "profile",
      "info",
      "Falta aprovar o perfil inteligente",
      "A câmera já entregou imagem e possui liberação. O MonitorIA ainda precisa do contexto que orienta a análise.",
      null,
      { label: "Concluir perfil", href: routeFor(input, experience, "profile") },
      { label: "Abrir câmera", href: routeFor(input, experience, "camera") },
    );
  }

  if (["degraded", "critical"].includes(input.visualHealthStatus ?? "")) {
    return result(
      "visual_health",
      "camera",
      input.visualHealthStatus === "critical" ? "critical" : "attention",
      "A câmera está ativa, mas a imagem perdeu qualidade",
      "O problema é visual — como escurecimento, desfoque, obstrução ou mudança de enquadramento — e não deve ser mascarado alterando parâmetros automaticamente.",
      null,
      { label: "Ver funcionamento", href: routeFor(input, experience, "health") },
      { label: "Abrir câmera", href: routeFor(input, experience, "camera") },
    );
  }

  if (input.pipelineIssue) {
    return result(
      "pipeline_gap",
      "pipeline",
      "attention",
      "Câmera e Agent estão ativos, mas faltou evidência recente",
      "Existe sessão de monitoramento, porém o backend detectou uma lacuna posterior à última análise concluída. Isso separa falha de processamento de falha de câmera.",
      "O processamento transitório continua sujeito aos retries já existentes. O painel não reinicia o Agent nem altera o stream para esconder a lacuna.",
      { label: "Ver funcionamento", href: routeFor(input, experience, "health") },
      { label: "Baixar diagnóstico de suporte", href: "/api/support/diagnostics" },
    );
  }

  if (!input.monitorActive) {
    return result(
      "monitor_pending",
      "monitor",
      "attention",
      "Tudo está pronto, mas o monitor local ainda não confirmou início",
      "Câmera, imagem, plano, perfil e Agent estão disponíveis. O ponto pendente é a sessão de monitoramento contínuo.",
      "O Agent sincroniza a configuração e verifica as câmeras periodicamente. Nesta versão o painel observa a recuperação, mas não força restart do processo local.",
      { label: "Abrir câmera", href: routeFor(input, experience, "camera") },
      { label: "Funcionamento da câmera", href: routeFor(input, experience, "health") },
    );
  }

  return result(
    "healthy",
    "none",
    "ok",
    "Nenhuma inconsistência detectada",
    "Computador, câmera, imagem, plano, perfil e monitor local estão coerentes com o estado de monitoramento.",
    null,
    { label: "Abrir câmera", href: routeFor(input, experience, "camera") },
  );
}

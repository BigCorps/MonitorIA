import type { OperationalAlert } from "@/src/contracts/operations";
import {
  monitoringConfidenceLabel,
  monitoringSeverityLabel,
  monitoringStateLabel,
} from "@/src/lib/monitoring-display";

export type OperationalAlertPresentation = {
  title: string;
  summary: string;
  recommendation: string;
  categoryLabel: string;
  priorityLabel: string;
  statusLabel: string;
  recordHref: string;
  recordLabel: string;
  detailReason: string | null;
  confidenceLabel: string | null;
};

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function healthIncidentType(alert: OperationalAlert) {
  return textValue(alert.condition.incidentType);
}

function cameraHealthPresentation(alert: OperationalAlert) {
  const incidentType = healthIncidentType(alert);

  switch (incidentType) {
    case "no_recent_observation":
      return {
        title: "Sem nova verificação da imagem",
        summary:
          "O MonitorIA não recebeu uma nova verificação visual desta câmera no intervalo esperado.",
        recommendation:
          "Confira se a câmera e o computador do Agent estão ligados e com conexão de rede.",
      };
    case "low_light":
      return {
        title: "Imagem escura",
        summary:
          "A imagem ficou mais escura que o normal e pode prejudicar o monitoramento.",
        recommendation:
          "Confira a iluminação do ambiente e se a lente da câmera está livre.",
      };
    case "overexposed":
      return {
        title: "Imagem clara demais",
        summary:
          "A imagem ficou clara demais em relação ao padrão normal desta câmera.",
        recommendation:
          "Confira a iluminação, reflexos e a posição da câmera.",
      };
    case "blurry":
      return {
        title: "Imagem possivelmente desfocada",
        summary:
          "A nitidez ficou abaixo do padrão normal desta câmera.",
        recommendation:
          "Confira o foco, a lente e se há sujeira, vapor ou movimento na câmera.",
      };
    case "lens_obstructed":
      return {
        title: "Possível obstrução da câmera",
        summary:
          "Parte importante da imagem pode estar bloqueada ou diferente do normal.",
        recommendation:
          "Confira se há algum objeto, sujeira ou cobertura em frente à lente.",
      };
    case "frame_shifted":
    case "profile_drift":
      return {
        title: "Câmera possivelmente deslocada",
        summary:
          "O enquadramento está diferente da referência aprovada para esta câmera.",
        recommendation:
          "Confira se a câmera foi movimentada. Se o novo enquadramento for intencional, atualize a referência em Funcionamento.",
      };
    case "possible_frame_freeze":
      return {
        title: "Imagem possivelmente congelada",
        summary:
          "A imagem pode ter parado de atualizar mesmo com a câmera ainda conectada.",
        recommendation:
          "Confira a transmissão da câmera e a conexão do equipamento.",
      };
    case "image_degraded":
      return {
        title: "Qualidade da imagem reduzida",
        summary:
          "A imagem está diferente do padrão normal e pode prejudicar as análises.",
        recommendation:
          "Confira iluminação, foco, lente, enquadramento e conexão da câmera.",
      };
    default:
      return {
        title: alert.title,
        summary: alert.summary,
        recommendation:
          alert.recommendation ??
          "Confira a imagem e a conexão da câmera antes de atualizar a referência.",
      };
  }
}

function recordHref(alert: OperationalAlert) {
  if (alert.evidenceEventIds.length) {
    return `/dashboard/events/${alert.evidenceEventIds[0]}`;
  }

  if (
    [
      "camera_obstructed",
      "camera_drift",
      "camera_low_quality",
    ].includes(alert.code)
  ) {
    return alert.cameraId
      ? `/dashboard/camera-health?camera=${encodeURIComponent(alert.cameraId)}`
      : "/dashboard/camera-health";
  }

  if (
    [
      "opening_late",
      "closing_missing",
      "reopened_activity",
      "session_long",
    ].includes(alert.code)
  ) {
    return "/dashboard/routines";
  }

  if (alert.code === "process_incomplete") {
    return "/dashboard/processes";
  }

  if (["agent_offline", "outdated_agent"].includes(alert.code)) {
    return "/dashboard/installer";
  }

  if (alert.code === "camera_offline") {
    return "/dashboard/cameras";
  }

  if (["high_cost", "pix_pending"].includes(alert.code)) {
    return "/dashboard/billing";
  }

  if (alert.code === "storage_pressure") {
    return "/dashboard/storage";
  }

  return "/dashboard/events";
}

function basePresentation(alert: OperationalAlert) {
  switch (alert.code) {
    case "agent_offline":
      return {
        title: "Agent sem comunicação",
        summary:
          "O computador responsável por enviar as imagens deixou de se comunicar com o MonitorIA.",
        recommendation:
          "Confira se o computador está ligado, conectado à internet e com o serviço MonitorIA em execução.",
        categoryLabel: "Conexão",
      };
    case "camera_offline":
      return {
        title: "Câmera sem comunicação",
        summary:
          "O MonitorIA não está conseguindo receber imagens desta câmera.",
        recommendation:
          "Confira energia, rede e conexão da câmera. Se outras câmeras também estiverem offline, verifique o Agent.",
        categoryLabel: "Câmera",
      };
    case "outdated_agent":
      return {
        title: "Agent precisa ser atualizado",
        summary:
          "A versão instalada do Agent está abaixo da versão recomendada para esta operação.",
        recommendation:
          "Abra Instalação e siga as orientações de atualização disponíveis para sua conta.",
        categoryLabel: "Instalação",
      };
    case "high_cost":
      return {
        title: "Uso acima do esperado",
        summary:
          "O consumo do serviço ficou acima do limite operacional configurado.",
        recommendation:
          "Revise o uso atual e o plano antes de aumentar câmeras, frequência ou retenção.",
        categoryLabel: "Plano",
      };
    case "storage_pressure":
      return {
        title: "Armazenamento próximo do limite",
        summary:
          "O volume de dados armazenados está próximo do limite operacional configurado.",
        recommendation:
          "Revise a retenção de dados e o espaço disponível em Dados armazenados.",
        categoryLabel: "Dados",
      };
    case "pix_pending":
      return {
        title: "Pagamento pendente",
        summary:
          "Existe uma cobrança Pix que ainda não foi confirmada.",
        recommendation:
          "Confira o pagamento em Plano e cobrança antes do vencimento ou suspensão.",
        categoryLabel: "Cobrança",
      };
    case "opening_late":
      return {
        title: "Abertura mais tarde que o habitual",
        summary: alert.summary,
        recommendation:
          "Confira se houve uma exceção conhecida e consulte o registro relacionado.",
        categoryLabel: "Rotina",
      };
    case "closing_missing":
      return {
        title: "Fechamento não confirmado",
        summary: alert.summary,
        recommendation:
          "Confira se as etapas de fechamento foram concluídas e se houve alguma exceção.",
        categoryLabel: "Rotina",
      };
    case "reopened_activity":
      return {
        title: "Atividade após o fechamento",
        summary: alert.summary,
        recommendation:
          "Confira o registro para confirmar se a atividade era esperada ou precisa de atenção.",
        categoryLabel: "Rotina",
      };
    case "restricted_access":
      return {
        title: "Atividade em área restrita",
        summary: alert.summary,
        recommendation:
          "Confira o registro e confirme se a presença ou movimentação era autorizada.",
        categoryLabel: "Operação",
      };
    case "object_removed":
      return {
        title: "Objeto importante não localizado",
        summary: alert.summary,
        recommendation:
          "Confira os registros relacionados e confirme se a retirada era esperada.",
        categoryLabel: "Operação",
      };
    case "equipment_after_hours":
      return {
        title: "Equipamento ativo fora do horário",
        summary: alert.summary,
        recommendation:
          "Confira se o funcionamento fora do horário foi intencional.",
        categoryLabel: "Operação",
      };
    case "queue_excessive":
      return {
        title: "Fila acima do habitual",
        summary: alert.summary,
        recommendation:
          "Confira o atendimento atual e considere reforçar a operação se a fila continuar aumentando.",
        categoryLabel: "Atendimento",
      };
    case "session_long":
      return {
        title: "Atividade mais longa que o habitual",
        summary: alert.summary.replace(/sessão/gi, "atividade"),
        recommendation:
          "Confira o registro para saber se a atividade continua ou se já terminou.",
        categoryLabel: "Rotina",
      };
    case "camera_obstructed":
    case "camera_drift":
    case "camera_low_quality": {
      const health = cameraHealthPresentation(alert);
      return { ...health, categoryLabel: "Câmera" };
    }
    case "process_incomplete":
      return {
        title: "Processo possivelmente incompleto",
        summary: alert.summary,
        recommendation:
          "Revise as etapas observadas e confirme se o procedimento precisa ser concluído.",
        categoryLabel: "Processo",
      };
    default:
      return {
        title: alert.title,
        summary: alert.summary,
        recommendation:
          alert.recommendation ??
          "Confira o registro relacionado e valide se alguma ação é necessária.",
        categoryLabel: alert.cameraName ? "Câmera" : "Operação",
      };
  }
}

export function operationalAlertPresentation(
  alert: OperationalAlert,
): OperationalAlertPresentation {
  const base = basePresentation(alert);

  return {
    ...base,
    priorityLabel:
      alert.severity === "critical"
        ? "Urgente"
        : alert.severity === "warning"
          ? "Atenção"
          : monitoringSeverityLabel(alert.severity),
    statusLabel:
      alert.status === "acknowledged"
        ? "Estou verificando"
        : monitoringStateLabel(alert.status),
    recordHref: recordHref(alert),
    recordLabel: "Ver registro",
    detailReason:
      alert.code === "camera_low_quality"
        ? null
        : alert.reason && !alert.reason.toLowerCase().includes("baseline")
          ? alert.reason
          : null,
    confidenceLabel:
      alert.confidence === null
        ? null
        : monitoringConfidenceLabel(alert.confidence),
  };
}

export function operationalAlertContext(alert: OperationalAlert) {
  return [alert.siteName, alert.cameraName ?? alert.agentName]
    .filter(Boolean)
    .join(" · ") || "Organização";
}

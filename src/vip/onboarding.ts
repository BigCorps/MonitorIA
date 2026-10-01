import type {
  VipOnboardingSnapshot,
  VipProjectStatus,
} from "./types";

export const VIP_ONBOARDING_STEPS = [
  { id: "project", label: "Projeto" },
  { id: "install", label: "Instalação" },
  { id: "cameras", label: "Câmeras" },
  { id: "context", label: "Calibração" },
  { id: "ready", label: "Pronto" },
  { id: "trial", label: "Teste" },
  { id: "results", label: "Resultado" },
  { id: "proposal", label: "Proposta" },
  { id: "payment", label: "Ativação" },
] as const;

export type VipOnboardingStepId = (typeof VIP_ONBOARDING_STEPS)[number]["id"];

export function vipStepForStatus(
  status: VipProjectStatus,
  attentionCode: string | null = null,
): VipOnboardingStepId {
  if (status === "installing" && attentionCode === "discover_cameras") {
    return "cameras";
  }

  switch (status) {
    case "lead":
    case "invited":
    case "project_setup":
      return "project";
    case "installing":
      return "install";
    case "calibrating":
      return "context";
    case "ready_for_trial":
      return "ready";
    case "trial_running":
      return "trial";
    case "trial_completed":
      return "results";
    case "proposal":
      return "proposal";
    case "payment_pending":
    case "active":
    case "cancelled":
      return "payment";
  }
}

export function vipStepIndex(
  status: VipProjectStatus,
  attentionCode: string | null = null,
) {
  const step = vipStepForStatus(status, attentionCode);
  return Math.max(0, VIP_ONBOARDING_STEPS.findIndex((item) => item.id === step));
}

export function vipProgressPercent(
  status: VipProjectStatus,
  attentionCode: string | null = null,
) {
  if (status === "active") return 100;
  const index = vipStepIndex(status, attentionCode);
  return Math.round((index / (VIP_ONBOARDING_STEPS.length - 1)) * 100);
}

export type VipNextAction = {
  code: string;
  title: string;
  description: string;
};

export function vipNextAction(
  attentionCode: string | null,
  snapshot?: Partial<VipOnboardingSnapshot> | null,
): VipNextAction {
  const cameras = Number(snapshot?.camerasTotal ?? 0);
  const ready = Number(snapshot?.trialReadyCameras ?? 0);
  const selected = Number(snapshot?.trialCameras ?? 0);

  switch (attentionCode) {
    case "workspace_required":
      return {
        code: attentionCode,
        title: "Concluir a estrutura do projeto",
        description: "Confirme a empresa e o primeiro local para continuar a implantação.",
      };
    case "install_agent":
      return {
        code: attentionCode,
        title: "Conectar o primeiro computador",
        description: "Instale ou abra o MonitorIA no computador que enxerga as câmeras. O teste ainda não começa.",
      };
    case "discover_cameras":
      return {
        code: attentionCode,
        title: "Encontrar as câmeras",
        description: "O computador já está preparado. Agora procure as câmeras da rede e confirme as que farão parte da implantação.",
      };
    case "configure_camera_context":
      return {
        code: attentionCode,
        title: "Concluir nome e contexto das câmeras",
        description: `${cameras || "As"} câmera(s) foram encontradas. Identifique cada uma e aprove o perfil inteligente antes do piloto.`,
      };
    case "trial_not_linked":
      return {
        code: attentionCode,
        title: "Preparar a demonstração assistida",
        description: "O projeto está configurado, mas o trial ainda precisa ser vinculado ao convite VIP.",
      };
    case "select_trial_cameras":
      return {
        code: attentionCode,
        title: "Escolher as câmeras do piloto",
        description: "Selecione até 6 câmeras. Todas serão analisadas no modo Intensive durante a demonstração de 60 minutos.",
      };
    case "resolve_camera_readiness":
      return {
        code: attentionCode,
        title: "Resolver as últimas pendências",
        description: `${ready}/${selected} câmera(s) do piloto estão prontas. Cada pendência abaixo mostra exatamente o que falta.`,
      };
    case "ready_to_start":
      return {
        code: attentionCode,
        title: "Tudo pronto para os 60 minutos",
        description: "As câmeras selecionadas estão prontas e o relógio ainda não começou. A demonstração será iniciada somente na sua confirmação.",
      };
    case "trial_running":
      return {
        code: attentionCode,
        title: "Demonstração em andamento",
        description: "As câmeras estão em análise. Acompanhe o tempo, os acontecimentos e a Pesquisa IA.",
      };
    case "review_trial_results":
      return {
        code: attentionCode,
        title: "Revisar o resultado do piloto",
        description: "A captura terminou. Os dados permanecem disponíveis para revisão antes da proposta.",
      };
    case "contract_converted":
      return {
        code: attentionCode,
        title: "Projeto convertido",
        description: "A contratação foi registrada. O próximo passo é concluir a ativação comercial.",
      };
    default:
      return {
        code: attentionCode ?? "continue_onboarding",
        title: "Continuar a implantação",
        description: "O MonitorIA salvou seu progresso e mostra abaixo a próxima etapa necessária.",
      };
  }
}

export function readinessAction(reason: string, cameraId: string | null) {
  const focus = cameraId ? `?camera=${encodeURIComponent(cameraId)}` : "";

  return {
    label: "Ver como resolver",
    href: `/vip/onboarding${focus}#readiness-help`,
    reason,
  };
}

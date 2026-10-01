import type { VipProjectStatus } from "./types";

export const VIP_PROJECT_STATUS_LABELS: Record<VipProjectStatus, string> = {
  lead: "Lead",
  invited: "Convite enviado",
  project_setup: "Estrutura do projeto",
  installing: "Instalação",
  calibrating: "Calibração",
  ready_for_trial: "Pronto para teste",
  trial_running: "Teste em andamento",
  trial_completed: "Teste concluído",
  proposal: "Proposta",
  payment_pending: "Aguardando pagamento",
  active: "Ativo",
  cancelled: "Cancelado",
};

const TRANSITIONS: Record<VipProjectStatus, readonly VipProjectStatus[]> = {
  lead: ["invited", "cancelled"],
  invited: ["project_setup", "cancelled"],
  project_setup: ["installing", "cancelled"],
  installing: ["calibrating", "project_setup", "cancelled"],
  calibrating: ["ready_for_trial", "installing", "cancelled"],
  ready_for_trial: ["trial_running", "calibrating", "cancelled"],
  trial_running: ["trial_completed", "cancelled"],
  trial_completed: ["proposal", "cancelled"],
  proposal: ["payment_pending", "trial_completed", "cancelled"],
  payment_pending: ["active", "proposal", "cancelled"],
  active: ["cancelled"],
  cancelled: [],
};

export function canTransitionVipProject(
  from: VipProjectStatus,
  to: VipProjectStatus,
) {
  return from === to || TRANSITIONS[from].includes(to);
}

export function nextVipProjectStatuses(status: VipProjectStatus) {
  return [...TRANSITIONS[status]];
}

export function vipProjectStillInOnboarding(status: VipProjectStatus) {
  return status !== "active" && status !== "cancelled";
}

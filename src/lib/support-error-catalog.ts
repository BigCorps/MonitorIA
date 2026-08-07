export type SupportErrorEntry = {
  code: string;
  title: string;
  action: string;
};

export const supportErrorCatalog: SupportErrorEntry[] = [
  { code: "agent_offline", title: "Agent sem comunicação", action: "Confirme que o computador está ligado e que o serviço MonitorIA Agent está em execução." },
  { code: "camera_offline", title: "Câmera sem comunicação", action: "Verifique energia, cabo/rede e se a câmera continua acessível no DVR ou NVR." },
  { code: "queue_accumulated", title: "Fila local acumulada", action: "Mantenha o Agent ligado e verifique a conexão de internet; os itens serão reenviados automaticamente." },
  { code: "analysis_failing", title: "Análise temporariamente indisponível", action: "Aguarde a próxima tentativa automática. Se persistir, exporte o diagnóstico para o suporte." },
  { code: "clip_failing", title: "Não foi possível preparar o clipe", action: "Confirme que o DVR ainda conserva o período solicitado e que o Agent tem acesso ao fluxo local." },
  { code: "high_cost", title: "Limite de custo atingido", action: "O roteamento econômico continua ativo. Revise o painel de custos antes de ampliar o plano de análise." },
  { code: "storage_pressure", title: "Expurgo de arquivos pendente", action: "O processo automático tentará novamente. Envie o diagnóstico se o aviso permanecer por mais de um dia." },
  { code: "purge_delayed", title: "Exclusão automática atrasada", action: "Não envie arquivos manualmente. Acione o suporte com o diagnóstico exportado." },
  { code: "pix_pending", title: "Pix pendente", action: "Atualize a página de cobrança e confirme se o código ainda está no prazo de validade." },
  { code: "payment_divergent", title: "Pagamento divergente", action: "Não gere uma segunda cobrança. Envie o número da fatura ao suporte." },
  { code: "trial_overdue", title: "Trial encerrado", action: "Abra Planos e cobrança para escolher as câmeras que continuarão ativas." },
  { code: "outdated_agent", title: "Agent desatualizado", action: "Baixe a versão recomendada na página de instalação e execute o instalador no mesmo computador." },
  { code: "assistant_unavailable", title: "Assistente indisponível", action: "Tente novamente em alguns minutos; nenhuma interação é consumida quando a resposta falha." },
  { code: "opening_late", title: "Abertura atrasada", action: "Confira a evidência e valide se houve uma exceção conhecida na rotina do local." },
  { code: "closing_missing", title: "Fechamento não observado", action: "Verifique se o local encerrou a operação e se a câmera responsável pelo estado de fechamento está online." },
  { code: "reopened_activity", title: "Atividade após o fechamento", action: "Confira a evidência e valide se a atividade estava autorizada; o alerta não presume intenção." },
  { code: "restricted_access", title: "Acesso em área restrita", action: "Revise os capítulos da sessão e confirme se o acesso estava autorizado." },
  { code: "object_removed", title: "Objeto retirado", action: "Confira a evidência e valide se a retirada fazia parte da operação esperada." },
  { code: "equipment_after_hours", title: "Equipamento fora do horário", action: "Confirme se havia atividade autorizada e se o estado visual do equipamento está correto." },
  { code: "queue_excessive", title: "Fila acima do limite", action: "Confira a evidência e avalie reforço temporário no atendimento." },
  { code: "session_long", title: "Sessão longa", action: "Verifique se a atividade continua ou se a sessão deve ser encerrada por inatividade." },
  { code: "camera_obstructed", title: "Câmera possivelmente obstruída", action: "Verifique a lente e remova obstruções antes de recalibrar a referência visual." },
  { code: "camera_drift", title: "Enquadramento alterado", action: "Confirme a posição física da câmera antes de aprovar uma nova referência." },
  { code: "camera_low_quality", title: "Qualidade visual reduzida", action: "Verifique iluminação, foco, lente e conexão da câmera." },
  { code: "process_incomplete", title: "Processo incompleto", action: "Revise as etapas observadas e confirme se o procedimento precisa ser concluído." },
];

export function supportErrorEntry(code: string) {
  return supportErrorCatalog.find((entry) => entry.code === code) ?? null;
}

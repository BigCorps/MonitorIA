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
];

export function supportErrorEntry(code: string) {
  return supportErrorCatalog.find((entry) => entry.code === code) ?? null;
}


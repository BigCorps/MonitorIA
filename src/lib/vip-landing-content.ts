import type { VipPlanCode } from "@/src/vip/types";

export const vipHero = {
  kicker: "MonitorIA VIP · grandes operações",
  titleFirst: "Muitas câmeras.",
  titleSecond: "Uma operação pesquisável.",
  lede:
    "Transforme dezenas ou centenas de câmeras em informação que sua equipe consegue consultar, comparar e usar para decidir — sem depender de alguém assistindo tudo.",
  note:
    "Para grandes empresas, empresas de segurança e projetos científicos a partir de 10 câmeras.",
} as const;

export const vipProof = [
  {
    value: "10+ câmeras",
    label: "Projetos desenhados para operações que já trabalham em escala.",
  },
  {
    value: "Intensive",
    label: "O nível máximo de análise em todas as câmeras do Projeto VIP.",
  },
  {
    value: "Pesquisa IA",
    label: "Pergunte sobre horários, locais, continuidade, saúde, rotinas e processos.",
  },
  {
    value: "Especialista",
    label: "Implantação e piloto acompanhados do início à prova de valor.",
  },
] as const;

export const vipSectors = [
  {
    value: "Múltiplos locais",
    label:
      "Uma visão para matriz, filiais, fábricas, centros logísticos e áreas críticas — sem perder o contexto de cada ambiente.",
    sector: "Médias e Grandes empresas",
    tone: "enterprise",
    media: "sector-store",
  },
  {
    value: "Mais evidência",
    label:
      "Sua equipe chega mais rápido ao que merece atenção, cruza acontecimentos e reduz o tempo gasto procurando trechos.",
    sector: "Empresas de segurança e monitoramento",
    tone: "security",
    media: "sector-forecourt",
  },
  {
    value: "Longos períodos",
    label:
      "Câmeras ao vivo e gravações locais viram uma base consultável por tempo, ambiente, acontecimento e contexto observável.",
    sector: "Fábricas, Faculdades, Projetos científicos, etc",
    tone: "science",
    media: "sector-warehouse",
  },
] as const;

export const vipProblems = [
  {
    title: "Quanto mais câmeras, mais difícil achar o que importa",
    text:
      "A operação cresce, mas o tempo da equipe não. O problema deixa de ser gravar e passa a ser localizar o minuto certo entre dezenas de fontes.",
  },
  {
    title: "Um acontecimento raramente cabe em uma câmera só",
    text:
      "Pessoas, veículos e processos atravessam ambientes. Sem continuidade, a equipe recebe fragmentos e precisa reconstruir a história manualmente.",
  },
  {
    title: "A câmera pode estar ligada e ainda assim não estar servindo",
    text:
      "Imagem congelada, escura, obstruída ou fora do lugar só costuma aparecer quando alguém precisa da gravação. Em escala, isso vira risco operacional.",
  },
] as const;

export const vipValueSteps = [
  {
    time: "08:12",
    kicker: "Escala",
    title: "Veja a operação como um conjunto, não como uma parede de telas",
    text:
      "Projetos, locais e câmeras ficam organizados numa mesma estrutura. A equipe continua sabendo onde aconteceu, mas deixa de depender de abrir fonte por fonte.",
    scene: "multi-site",
  },
  {
    time: "10:36",
    kicker: "Pesquisa",
    title: "Pergunte à operação inteira com as suas palavras",
    text:
      "Procure acontecimentos por período, local e contexto. Compare câmeras, investigue continuidade e chegue ao horário e às evidências sem navegar relatório por relatório.",
    scene: "search",
  },
  {
    time: "14:22",
    kicker: "Prioridade",
    title: "Seu time trabalha no que exige atenção — não no que apenas aconteceu",
    text:
      "Acontecimentos, saúde das câmeras e sinais operacionais ficam estruturados para revisão. Isso reduz triagem manual e ajuda a concentrar pessoas no que pede decisão.",
    scene: "security",
  },
  {
    time: "18:40",
    kicker: "Prova",
    title: "Veja valor no seu próprio ambiente antes de contratar",
    text:
      "O piloto usa até 6 câmeras reais da operação em modo Intensive. Os 60 minutos só começam depois da prontidão técnica e geram uma prova de valor para a decisão.",
    scene: "science",
  },
] as const;

export const vipUnderstands = [
  {
    title: "Acontecimentos completos",
    text:
      "Entradas, esperas, entregas, passagens e interações deixam de ser registros isolados e ganham horário, local e evidência.",
  },
  {
    title: "Continuidade entre câmeras",
    text:
      "O mesmo movimento pode ser acompanhado entre ambientes como correspondência provável, ajudando a reconstruir sequências sem identificação biométrica.",
  },
  {
    title: "Saúde das câmeras",
    text:
      "Disponibilidade e degradação visual entram no contexto: imagem congelada, escura, obstruída ou fora do padrão deixa de ser descoberta tarde demais.",
  },
  {
    title: "Rotinas",
    text:
      "Abertura, fechamento, movimento recorrente e outros padrões operacionais podem ser consultados e comparados ao longo do tempo.",
  },
  {
    title: "Processos",
    text:
      "Etapas e desvios configurados deixam de ficar espalhados em gravações e passam a poder ser pesquisados pelo contexto do Projeto.",
  },
  {
    title: "Câmeras ao vivo e gravações",
    text:
      "Projetos científicos e investigações podem trabalhar com fontes conectadas ou arquivos locais dentro do mesmo nível técnico Intensive.",
  },
] as const;

export const vipAssistantExamples = [
  "O que aconteceu depois do fechamento nas quatro unidades?",
  "Em quais câmeras este veículo apareceu hoje?",
  "Qual câmera apresentou degradação durante a madrugada?",
  "Houve movimento fora da rotina no centro de distribuição?",
  "Compare o processo desta semana com o período anterior.",
] as const;

export const vipAssistantIncludes = [
  "Pesquisa por período, câmera, local e contexto",
  "Continuidade provável entre câmeras",
  "Saúde histórica das câmeras",
  "Rotinas e processos configurados",
  "Evidências ligadas à resposta",
  "Acesso também por integrações MCP autorizadas",
] as const;

export const vipPlanPositioning: Record<
  VipPlanCode,
  { badge: string; summary: string; idealFor: string }
> = {
  vip10: {
    badge: "Entrada VIP",
    summary: "Para uma operação crítica ou primeiro Projeto corporativo.",
    idealFor: "Até 10 câmeras incluídas",
  },
  vip50: {
    badge: "Escala",
    summary: "Para múltiplos ambientes, unidades ou uma central em crescimento.",
    idealFor: "Até 50 câmeras incluídas",
  },
  vip150: {
    badge: "Grande operação",
    summary: "Para redes, grandes centrais e projetos com alta densidade de câmeras.",
    idealFor: "Até 150 câmeras incluídas",
  },
};

export const vipTrialFacts = [
  { value: "60 min", label: "de análise real acompanhada" },
  { value: "Até 6", label: "câmeras reais no piloto" },
  { value: "Intensive", label: "em todas as câmeras testadas" },
  { value: "Sem cartão", label: "a decisão vem depois da prova de valor" },
] as const;

export const vipBoundaries = [
  "Você não precisa criar conta agora: a avaliação vem antes do convite.",
  "O relógio do piloto não corre durante instalação, conexão ou calibração.",
  "Não exige trocar as câmeras compatíveis que você já usa.",
  "Não usa reconhecimento facial nem leitura automática de placas.",
  "O Projeto só segue para cobrança depois de proposta e aceite.",
] as const;

export const vipFaq = [
  {
    q: "Para quem o MonitorIA VIP foi feito?",
    a:
      "Para operações a partir de 10 câmeras que precisam de uma implantação acompanhada e de inteligência em escala: grandes empresas, empresas de segurança, centrais de monitoramento e projetos científicos.",
  },
  {
    q: "Qual é a diferença entre o MonitorIA padrão e o VIP?",
    a:
      "No VIP, todas as câmeras usam o nível técnico Intensive, o contrato é por Projeto, existe capacidade incluída por pacote, implantação assistida, piloto acompanhado de 60 minutos e uma camada própria para Projetos e recursos avançados.",
  },
  {
    q: "Preciso trocar minhas câmeras?",
    a:
      "Não quando a fonte já é compatível com o MonitorIA. O Projeto pode aproveitar câmeras conectadas por equipamentos existentes e também trabalhar com gravações locais em cenários científicos. A compatibilidade é validada antes do piloto.",
  },
  {
    q: "O piloto começa quando eu preencher o formulário?",
    a:
      "Não. O formulário apenas inicia a avaliação comercial. Se o cenário fizer sentido, um especialista cria o Projeto e envia um convite. Os 60 minutos só começam depois de Agent, câmeras, contexto e prontidão estarem concluídos.",
  },
  {
    q: "O MonitorIA identifica pessoas pelo rosto ou lê placas?",
    a:
      "Não. O produto trabalha com acontecimentos e contexto observável, sem reconhecimento facial e sem leitura automática de placas. Continuidade entre câmeras é tratada como correspondência provável, não como identidade.",
  },
  {
    q: "Como funciona o pagamento?",
    a:
      "O cliente recebe uma proposta do Projeto e escolhe mensal ou anual. A base anual é pré-paga; câmeras excedentes continuam mensais. O pagamento é por Pix e a ativação ocorre depois da confirmação.",
  },
  {
    q: "Posso usar a Pesquisa IA em muitas câmeras?",
    a:
      "Sim. A Pesquisa IA do VIP foi desenhada para consultar o contexto do Projeto: períodos, locais, câmeras, saúde, rotinas, processos e continuidades. O saldo de interações segue a política comercial da conta e pode receber pacotes adicionais.",
  },
] as const;

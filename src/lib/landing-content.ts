import { appConfig } from "./app-config";

/**
 * Conteúdo da landing.
 *
 * FONTE ÚNICA: PLANO-DE-PRODUCAO.md v1.0.
 * Cada bloco referencia a seção de origem. Não adicione afirmação
 * que não exista no plano — especialmente número, prazo ou preço.
 *
 * REGRA DE LINGUAGEM (revisão de agosto/2026)
 * A página fala com dono de comércio, não com integrador. Termos que
 * NÃO entram no texto visível: ONVIF, RTSP, snapshot, metadados,
 * franquia, gateway, x64, Agent, pareamento, frame.
 * DVR e NVR ficam: o público conhece e são a prova de que falamos
 * a língua dele.
 *
 * O produto é "o MonitorIA" (masculino). Ver appConfig.slogan.
 */

/* ==========================================================================
   CHAMADAS PARA AÇÃO
   ==========================================================================

   `trialIsLive` decide para onde apontam todos os botões da página.

   true  — os CTAs levam a /login?criar=1 e a seção do teste fala no
           presente. Exige a Fase 3 do PLANO-DE-PRODUCAO concluída: tabela
           de trial, onboarding com as três etapas e o botão "Iniciar teste"
           existindo no produto. É o modo atual.

   false — os CTAs levam ao WhatsApp e a seção do teste passa para o futuro
           ("será assim"), sem prometer o que ainda não abriu. Use se a
           landing precisar ir ao ar antes da Fase 3.

   Trocar de um modo para o outro é só inverter esta constante.
   ========================================================================== */

export const trialIsLive: boolean = true;

export type Cta = {
  label: string;
  href: string;
  /** true = abre em nova aba com rel="noopener noreferrer" */
  external: boolean;
};

/** Botão principal do herói e do fechamento. */
export const primaryCta: Cta = trialIsLive
  ? { label: "Começar o teste grátis", href: "/login?criar=1", external: false }
  : { label: "Falar no WhatsApp", href: appConfig.whatsappUrl, external: true };

/** Botão secundário do herói e do fechamento. */
export const secondaryCta: Cta = trialIsLive
  ? { label: "Falar no WhatsApp", href: appConfig.whatsappUrl, external: true }
  : { label: "Ver como funciona", href: "#como-funciona", external: false };

/** Botão da seção de teste grátis. */
export const trialCta: Cta = trialIsLive
  ? { label: "Começar o teste grátis", href: "/login?criar=1", external: false }
  : { label: "Quero ser avisado quando abrir", href: appConfig.whatsappUrl, external: true };

/** Linha abaixo dos botões da seção de teste. */
export const trialNote = trialIsLive
  ? "Sem cartão de crédito. Qualquer um dos três planos pode ser testado."
  : "O teste gratuito ainda não está aberto. Fale com a gente para entrar na lista e ser avisado assim que abrir.";

/* ==========================================================================
   COMPATIBILIDADE
   ==========================================================================

   Substitui a afirmação de "99% das câmeras", que não temos como auditar
   e que o comentário no topo deste arquivo proíbe. A formulação abaixo é
   verificável, cobre a câmera de aplicativo e nomeia a exceção — o que
   converte melhor que uma porcentagem, porque responde a objeção em vez
   de criar dúvida.
   ========================================================================== */

export const compatibility = {
  /** Uma linha, para o herói. */
  short:
    "Funciona com a câmera que você já tem — pelo DVR, pelo NVR ou pelo aplicativo que dá acesso ao vídeo.",
  /** Frase da exceção, reaproveitada no FAQ e nos limites. */
  exception:
    "Fica de fora só a câmera que vive presa na nuvem do fabricante, como Ring, Nest, Blink e Arlo.",
  /** Convite que abre conversa em vez de deixar a dúvida no ar. */
  invite:
    "Não sabe qual é a sua? Manda o modelo no WhatsApp que a gente confirma em minutos.",
} as const;

export const landingPlans = [
  {
    code: "basic",
    /** Etiqueta de posicionamento. Não repete o nome do plano. */
    badge: "Mais simples",
    name: "Essencial",
    price: "39,90",
    summary: "Para a câmera que só precisa ficar registrada.",
    history: "1 ano",
    images: "1 imagem de cada acontecimento",
    imageDetail: "o momento principal",
    clip: null,
  },
  {
    code: "standard",
    badge: "Mais escolhida",
    name: "Atenta",
    price: "79,90",
    summary: "Para atendimento, estoque e áreas de circulação.",
    history: "1 ano",
    images: "2 imagens de cada acontecimento",
    imageDetail: "começo e momento principal",
    clip: null,
  },
  {
    code: "intensive",
    badge: "Máximo detalhe",
    name: "Detalhada",
    price: "149,90",
    summary: "Para caixa, entrada e cofre.",
    history: "1 ano",
    images: "3 imagens de cada acontecimento",
    imageDetail: "começo, meio e fim",
    clip: "Clipe de 15 segundos, guardado por 30 dias",
  },
] as const;

/** §3.2 — incluído em todos os planos. */
export const planIncludes = [
  "Histórico pesquisável por 1 ano",
  "Busca por texto e filtros",
  "Assistente que responde perguntas",
  "Gráficos e evidências",
  "Exportar para planilha ou relatório",
  "Vários usuários",
  "Vários locais",
  "Programa da loja e atualizações",
  "90 perguntas ao Assistente por mês",
] as const;

/** §3.4 — desconto por posição da câmera. */
export const discountTiers = [
  { range: "1ª e 2ª câmera", off: "0%" },
  { range: "3ª e 4ª", off: "5%" },
  { range: "5ª à 8ª", off: "10%" },
  { range: "9ª à 16ª", off: "15%" },
  { range: "17ª em diante", off: "20%" },
] as const;

/** §3.4 — exemplo de fatura, reproduzido literalmente do plano. */
export const invoiceExample = {
  lines: [
    { label: "Detalhada", value: "R$ 149,90" },
    { label: "Atenta", value: "R$ 79,90" },
    { label: "Essencial · 5%", value: "R$ 37,91" },
    { label: "Essencial · 5%", value: "R$ 37,91" },
  ],
  subtotal: "R$ 309,60",
  discount: "R$ 3,99",
  total: "R$ 305,61",
} as const;

/** §3.3 — teste gratuito. */
export const trialFacts = [
  { value: "1", label: "câmera" },
  { value: "24h", label: "de análise real" },
  { value: "7 dias", label: "para explorar os resultados" },
  { value: "21", label: "perguntas ao Assistente" },
] as const;

/**
 * §2.1 — o que o MonitorIA não será na v1.
 *
 * Reduzido de 8 para 5. Os três que saíram viraram afirmação em outro
 * lugar da página: "usa as câmeras que você já tem" foi para o herói,
 * "você instala sozinho" foi para o passo 1 do como funciona, e a leitura
 * de placas entrou junto do reconhecimento facial.
 */
export const boundaries = [
  "Não manda seu vídeo para a nuvem: ele fica no seu equipamento",
  "Não substitui o seu DVR ou NVR",
  "Não usa reconhecimento facial nem leitura de placas",
  "Não pede cartão de crédito",
  "Não renova sozinho: a decisão é sua todo mês",
] as const;

/** §3.6 e §7.4 — instalação e descoberta. */
export const steps = [
  {
    time: "08:04",
    kicker: "Instalação",
    title: "Você instala o programa no computador da loja",
    text: "Um programa para Windows ou Linux que você mesmo instala, sem taxa e sem visita técnica. Ele fica no seu computador e conversa com as suas câmeras.",
    media: "agent-install",
  },
  {
    time: "08:09",
    kicker: "Suas câmeras",
    title: "As câmeras aparecem sozinhas",
    text: "O MonitorIA testa por conta própria as formas de conexão do seu equipamento até encontrar as câmeras. Digitar endereço à mão é a exceção, não o caminho.",
    media: "camera-discovery",
  },
  {
    time: "09:14",
    kicker: "Registro",
    title: "O que acontece vira anotação com horário",
    text: "Parado, nada é registrado. Quando alguém entra, um carro chega ou algo sai do lugar, o MonitorIA guarda horário, descrição, pessoas, veículos, objetos, áreas e imagem.",
    media: "event-capture",
  },
  {
    time: "19:47",
    kicker: "Consulta",
    title: "Você pergunta com as suas palavras",
    text: "Em vez de rebobinar duas horas de gravação, pergunte e receba o horário exato. Depois é só abrir aquele minuto no seu equipamento.",
    media: "search-answer",
  },
] as const;

/** Dores. Nenhuma estatística — não temos número verificado para citar. */
export const problems = [
  {
    title: "O HD do DVR se apaga sozinho",
    text: "Quando você lembra de procurar, o dia que interessava já foi gravado por cima.",
  },
  {
    title: "Achar um momento é rebobinar horas",
    text: "Você sabe mais ou menos o dia. Não sabe o minuto. E é o minuto que resolve.",
  },
  {
    title: "Ninguém abre a câmera por rotina",
    text: "Ela só é aberta quando algo deu errado. Todo o resto do que ela viu se perde.",
  },
] as const;

/**
 * Comparação de quanto tempo cada coisa sobrevive.
 * Antes estava fixo no JSX da seção de retenção; virou dado para a seção
 * do problema poder absorver o argumento sem duplicar seção.
 */
export const retentionScales = [
  { label: "Gravação em nuvem comum", span: "3 a 7 dias", width: "2%", mine: false },
  { label: "HD do seu DVR", span: "15 a 30 dias", width: "8%", mine: false },
  { label: "Histórico no MonitorIA.cam", span: "1 ano", width: "100%", mine: true },
] as const;

export const retentionNote =
  "O MonitorIA guarda horário, descrição, pessoas, veículos, objetos, áreas e as imagens do acontecimento. O vídeo inteiro continua no seu equipamento.";

/** Setores. Os números são fatos do produto, não resultados de cliente. */
export const sectors = [
  {
    value: "1 ano",
    label: "de histórico pesquisável, em todos os planos",
    sector: "Comércio de rua",
    media: "sector-store",
  },
  {
    value: "3 imagens",
    label: "de cada acontecimento no plano Detalhada: começo, meio e fim",
    sector: "Postos e oficinas",
    media: "sector-forecourt",
  },
  {
    value: "0 câmeras",
    label: "para comprar. O MonitorIA usa as que já estão instaladas",
    sector: "Condomínios e depósitos",
    media: "sector-warehouse",
  },
] as const;

/* ==========================================================================
   O QUE ELE ENTENDE SOZINHO
   ==========================================================================

   Seção nova. Cada item corresponde a um módulo que já existe no código e
   que não aparecia na página:

   1 → src/contracts/interaction-session.ts
   2 → src/contracts/routine-intelligence.ts
   3 → src/contracts/camera-health.ts
   4 → src/contracts/visual-state.ts
   5 → src/contracts/staff-operational-profile.ts
   6 → src/lib/event-continuity.ts e event-vehicle-continuity.ts

   São exatamente 6 para fechar a grade 3×2 do .problemGrid e casar com os
   seis passos de .stagger definidos no CSS. Não adicione um sétimo sem
   antes estender o CSS.
   ========================================================================== */

export const understands = [
  {
    title: "Atendimentos, entregas e visitas",
    text: "Em vez de registros soltos, você vê o atendimento inteiro: quem chegou, quanto tempo esperou, quem atendeu e o que passou de mão em mão.",
  },
  {
    title: "A rotina, aprendida sozinha",
    text: "Depois de alguns dias, o MonitorIA já sabe a que hora sua loja costuma abrir e fechar. Quando abre tarde, fecha cedo ou tem movimento fora do horário, ele aponta.",
  },
  {
    title: "Aviso quando a câmera para de servir",
    text: "Lente suja, imagem congelada, câmera torta, escuro demais. Você descobre no dia — não no dia em que precisou da gravação.",
  },
  {
    title: "Portão, porta e cofre",
    text: "Aberto, fechado e por quanto tempo ficou assim. O MonitorIA acompanha o estado das coisas, não só o movimento das pessoas.",
  },
  {
    title: "Sua equipe, sem reconhecimento facial",
    text: "Ele aprende o padrão de turno de quem trabalha ali e separa equipe de cliente. Sem identificar o rosto de ninguém.",
  },
  {
    title: "A mesma pessoa em momentos diferentes",
    text: "O carro que passou três vezes e a pessoa que voltou uma hora depois aparecem ligados, e não como registros sem relação.",
  },
] as const;

/* ==========================================================================
   ASSISTENTE
   ==========================================================================
   §3.5 e §6.2. A seção passa a vender capacidade primeiro; a cota mensal
   virou nota de rodapé do cartão da direita.
   ========================================================================== */

export const assistantExamples = [
  "Quem entrou depois das 22h ontem?",
  "Teve entrega na quinta de manhã?",
  "O portão ficou aberto muito tempo esta semana?",
  "Comparar o movimento deste sábado com o do anterior",
] as const;

/** Integração por MCP — src/mcp/ e app/mcp/route.ts. */
export const integration = {
  title: "Também dentro do ChatGPT e do Claude",
  items: [
    "Pergunte sobre as suas câmeras sem sair do assistente que você já usa",
    "As respostas trazem os mesmos horários e evidências do painel",
    "Você autoriza o acesso e pode retirar quando quiser",
  ],
} as const;

export const assistantFree = [
  "Abrir um acontecimento",
  "Pesquisar por texto",
  "Aplicar filtros",
  "Ver gráficos",
  "Exportar",
  "Resposta que falhou",
  "Cancelar antes de concluir",
] as const;

export const faq = [
  {
    q: "Funciona com a minha câmera?",
    a: `${compatibility.short} Não precisa trocar nada e não precisa comprar equipamento novo. ${compatibility.exception} ${compatibility.invite}`,
  },
  {
    q: "O vídeo vai para a nuvem?",
    a: "Não. O vídeo inteiro permanece no seu DVR, NVR, câmera ou computador. O MonitorIA envia para análise apenas as imagens escolhidas de cada acontecimento.",
  },
  {
    q: "Tem reconhecimento facial?",
    a: "Não. O MonitorIA descreve o que aparece na cena, não identifica quem é. Também não faz leitura de placas. É uma decisão de projeto, não algo em desenvolvimento.",
  },
  {
    q: "Em quais sistemas o programa roda?",
    a: "Windows e Linux. Mac ainda não.",
  },
  {
    q: "Como é o pagamento?",
    a: "Pix, uma fatura por empresa, ciclo de 30 dias, com três dias de tolerância após o vencimento. Sem cartão preso e sem cobrança automática.",
  },
  {
    q: "Existe mensalidade além das câmeras?",
    a: "Não. Não há mensalidade por conta, por empresa nem por local. A cobrança é somente por câmera ativa.",
  },
  {
    q: "O que acontece se eu passar das 90 perguntas do Assistente?",
    a: "Primeiro entram as 90 perguntas do mês, depois o saldo extra que você tenha comprado, e só então o Assistente é bloqueado com uma oferta de pacote. Pesquisa, filtros e exportação continuam liberados — eles não gastam pergunta.",
  },
] as const;

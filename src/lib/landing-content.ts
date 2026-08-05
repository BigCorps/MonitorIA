import { appConfig } from "./app-config";

/**
 * Conteúdo da landing.
 *
 * FONTE ÚNICA: PLANO-DE-PRODUCAO.md v1.0.
 * Cada bloco referencia a seção de origem. Não adicione afirmação
 * que não exista no plano — especialmente número, prazo ou preço.
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

export const landingPlans = [
  {
    code: "basic",
    name: "Essencial",
    price: "39,90",
    summary: "Para as câmeras que só precisam ser lembradas.",
    history: "365 dias",
    images: "1 imagem por acontecimento",
    imageDetail: "momento de pico",
    clip: null,
  },
  {
    code: "standard",
    name: "Atenta",
    price: "79,90",
    summary: "Para atendimento, estoque e áreas de circulação.",
    history: "365 dias",
    images: "2 imagens por acontecimento",
    imageDetail: "início e pico",
    clip: null,
  },
  {
    code: "intensive",
    name: "Detalhada",
    price: "149,90",
    summary: "Para caixa, entrada e cofre.",
    history: "365 dias",
    images: "3 imagens por acontecimento",
    imageDetail: "início, pico e fim",
    clip: "Clipe de 15 segundos, guardado por 30 dias",
  },
] as const;

/** §3.2 — incluído em todos os planos. */
export const planIncludes = [
  "Metadados pesquisáveis por 365 dias",
  "Busca por texto e filtros",
  "Assistente IA",
  "Gráficos e evidências",
  "Exportação",
  "Múltiplos usuários",
  "Múltiplos locais",
  "Agent e atualizações",
  "90 interações mensais com o Assistente IA",
] as const;

/** §3.4 — desconto progressivo marginal, por posição da câmera. */
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
  { value: "21", label: "interações com o Assistente" },
] as const;

/** §2.1 — o que o MonitorIA não será na v1. */
export const boundaries = [
  "Não grava vídeo contínuo na nuvem",
  "Não substitui o seu DVR ou NVR",
  "Não exige trocar as câmeras compatíveis",
  "Não usa reconhecimento facial",
  "Não usa leitura avançada de placas",
  "Não exige instalação assistida",
  "Não pede cartão de crédito",
  "Não renova sozinho sem você mandar",
] as const;

/** §3.6 e §7.4 — instalação e descoberta. */
export const steps = [
  {
    time: "08:04",
    kicker: "Instalação",
    title: "Você instala o Agent no computador da loja",
    text: "Um programa para Windows 10 ou 11, instalado por você mesmo, sem taxa e sem técnico. Ele fica no seu computador e conversa com o seu DVR.",
    media: "agent-install",
  },
  {
    time: "08:09",
    kicker: "Pareamento",
    title: "As câmeras aparecem sozinhas",
    text: "A busca tenta ONVIF, depois o DVR ou NVR, depois endereços RTSP conhecidos e o snapshot. Digitar o endereço à mão é a saída, não o caminho.",
    media: "camera-discovery",
  },
  {
    time: "09:14",
    kicker: "Registro",
    title: "O que acontece vira anotação com horário",
    text: "Parado, nada é registrado. Quando alguém entra, um carro chega ou algo sai do lugar, o MonitorIA guarda horário, descrição, pessoas, veículos, objetos, zonas e imagem.",
    media: "event-capture",
  },
  {
    time: "19:47",
    kicker: "Consulta",
    title: "Você pergunta com as suas palavras",
    text: "Em vez de rebobinar duas horas de gravação, pergunte e receba o horário exato. Depois é só abrir aquele minuto no seu DVR.",
    media: "search-answer",
  },
] as const;

/** Dores. Nenhuma estatística — não temos número verificado para citar. */
export const problems = [
  {
    title: "O HD do DVR se sobrescreve sozinho",
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

/** Setores. Os números são fatos do produto, não resultados de cliente. */
export const sectors = [
  {
    value: "365 dias",
    label: "de histórico pesquisável, em todos os planos",
    sector: "Comércio de rua",
    media: "sector-store",
  },
  {
    value: "3 imagens",
    label: "por acontecimento no plano Detalhada: início, pico e fim",
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

/** §3.5 e §6.2 — franquia do Assistente. */
export const assistantConsumes = [
  "Pergunta enviada e respondida com sucesso",
] as const;

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
    q: "Preciso trocar minhas câmeras?",
    a: "Não. O MonitorIA trabalha com as câmeras já instaladas, desde que o seu DVR, NVR ou câmera exponha o vídeo por ONVIF ou RTSP. A descoberta tenta encontrar isso sozinha.",
  },
  {
    q: "O vídeo vai para a nuvem?",
    a: "Não. O vídeo contínuo permanece no seu DVR, NVR, câmera ou computador. O MonitorIA envia apenas as imagens escolhidas dos acontecimentos para análise.",
  },
  {
    q: "Tem reconhecimento facial?",
    a: "Não. A v1 não usa reconhecimento facial nem leitura avançada de placas. O sistema descreve o que aparece na cena, não identifica quem é.",
  },
  {
    q: "Em quais sistemas o Agent roda?",
    a: "Windows 10 x64 e Windows 11 x64. Windows Server depende de homologação. Não oferecemos macOS nem Linux.",
  },
  {
    q: "Como é o pagamento?",
    a: "Pix, uma fatura por empresa, ciclo de 30 dias, com três dias de tolerância após o vencimento. Sem cartão, sem gateway de assinatura e sem renovação automática.",
  },
  {
    q: "Existe mensalidade além das câmeras?",
    a: "Não. Não há mensalidade por conta, por empresa nem por local. A cobrança é somente por câmera ativa.",
  },
  {
    q: "O que acontece se eu passar das 90 interações do Assistente?",
    a: "A franquia mensal é usada primeiro, depois o saldo extra comprado, e só então o Assistente é bloqueado com uma oferta de pacote. Pesquisa, filtros e exportação continuam liberados — eles não consomem interação.",
  },
] as const;

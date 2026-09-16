export const integrationGroups = [
  {
    id: "food_pos",
    label: "PDV, restaurante e gestão",
    description: "Sistemas usados no caixa, salão, produção, estoque e gestão do food service.",
    options: [
      { key: "eye_mobile", label: "Eye Mobile" },
      { key: "grandchef", label: "GrandChef" },
      { key: "saipos", label: "Saipos" },
      { key: "consumer", label: "Consumer" },
      { key: "linx_degust", label: "Linx Degust" },
      { key: "totvs_food", label: "TOTVS Food Service / TOTVS Chef" },
      { key: "sischef", label: "Sischef" },
      { key: "ncr_colibri", label: "NCR Colibri" },
      { key: "goomer", label: "Goomer" },
      { key: "anota_ai", label: "Anota AI" },
    ],
  },
  {
    id: "delivery",
    label: "Delivery e marketplaces",
    description: "Pedidos e vendas originados em canais de delivery e marketplaces.",
    options: [
      { key: "ifood", label: "iFood" },
      { key: "99food", label: "99Food" },
      { key: "rappi", label: "Rappi" },
      { key: "keeta", label: "Keeta" },
      { key: "aiqfome", label: "aiqfome" },
      { key: "delivery_direto", label: "Delivery Direto" },
    ],
  },
  {
    id: "erp_retail",
    label: "ERP e varejo",
    description: "Sistemas com pedidos, vendas, estoque ou movimentações comerciais que podem enriquecer a conciliação.",
    options: [
      { key: "bling", label: "Bling" },
      { key: "omie", label: "Omie" },
    ],
  },
  {
    id: "autonomous_market",
    label: "Mercados autônomos e autoatendimento",
    description: "Plataformas e redes de varejo autônomo que podem ser avaliadas conforme o acesso técnico disponível.",
    options: [
      { key: "market4u", label: "market4u" },
      { key: "minha_quitandinha", label: "Minha Quitandinha" },
      { key: "nayax_vmpay", label: "Nayax / VMpay (VMtecnologia)" },
      { key: "honest_market", label: "Honest Market Brasil" },
      { key: "smart_break", label: "Smart Break" },
    ],
  },
  {
    id: "other",
    label: "Outro sistema",
    description: "Se o seu sistema não estiver listado, ainda podemos avaliar.",
    options: [
      { key: "other_pos", label: "Outro PDV" },
      { key: "other_delivery", label: "Outro delivery / marketplace" },
      { key: "other_autonomous", label: "Outro mercado autônomo" },
      { key: "other_system", label: "Outro ERP / sistema próprio" },
    ],
  },
] as const;

export const integrationUseCases = [
  { key: "sale_without_visual", label: "Venda registrada sem correspondência visual" },
  { key: "visual_without_sale", label: "Produto preparado, entregue ou retirado sem venda" },
  { key: "quantity_mismatch", label: "Quantidade observada x quantidade vendida" },
  { key: "add_on_mismatch", label: "Adicionais observados x adicionais registrados" },
  { key: "cancellation_review", label: "Cancelamentos e situações suspeitas" },
  { key: "autonomous_loss", label: "Prevenção de perdas em mercado autônomo" },
  { key: "daily_report", label: "Relatório diário de divergências" },
  { key: "evidence_clip", label: "Acesso à evidência / trecho relacionado" },
] as const;

export const integrationBusinessTypes = [
  { key: "restaurant", label: "Restaurante / lanchonete" },
  { key: "kiosk", label: "Quiosque" },
  { key: "autonomous_market", label: "Mercado autônomo" },
  { key: "convenience", label: "Conveniência / minimercado" },
  { key: "retail", label: "Loja / varejo" },
  { key: "pharmacy", label: "Farmácia" },
  { key: "other", label: "Outro" },
] as const;

export const integrationAccessStatuses = [
  { key: "unknown", label: "Não sei" },
  { key: "api_available", label: "Já tenho API / credenciais" },
  { key: "integration_area", label: "Existe uma área de API ou integrações no sistema" },
  { key: "vendor_contact", label: "Consigo solicitar acesso ao fornecedor" },
  { key: "no_access", label: "Não encontrei nenhuma opção de integração" },
] as const;

export const integrationSystemKeys: string[] = integrationGroups.flatMap((group) =>
  group.options.map((option) => option.key),
);

export const integrationUseCaseKeys: string[] = integrationUseCases.map((item) => item.key);

const systemLabels: ReadonlyMap<string, string> = new Map<string, string>(
  integrationGroups.flatMap((group) =>
    group.options.map((option) => [option.key, option.label] as [string, string]),
  ),
);

const useCaseLabels: ReadonlyMap<string, string> = new Map<string, string>(
  integrationUseCases.map(
    (item) => [item.key, item.label] as [string, string],
  ),
);

export function integrationSystemLabel(key: string) {
  return systemLabels.get(key) ?? key;
}

export function integrationUseCaseLabel(key: string) {
  return useCaseLabels.get(key) ?? key;
}

const whatsappMessage = encodeURIComponent(
  "Olá! Quero saber mais sobre o MonitorIA.cam para as câmeras do meu negócio.",
);

/*
 * SLOGAN — FONTE ÚNICA
 * ---------------------------------------------------------------------------
 * O slogan estava escrito à mão em quatro lugares e havia divergido em três
 * versões diferentes: "A MonitorIA lembra" aqui, "O MonitorIA lembra" no
 * herói e no login, e "A IA lembra" no README.
 *
 * Agora existe um só lugar. Quem precisa da frase inteira usa
 * `appConfig.slogan`; quem precisa das duas metades separadas — só o herói,
 * que pinta a primeira em cinza e a segunda em branco — usa
 * `appConfig.sloganParts`. Não escreva o slogan à mão em nenhum arquivo novo.
 *
 * Consumidores de `slogan`: app/manifest.ts (é ele que nomeia o app no TWA e
 * na tela inicial do Android), app/layout.tsx (title, Open Graph, Twitter),
 * app/page.tsx, src/lib/seo.ts, src/components/seo/social-image.tsx,
 * src/components/marketing/site-chrome.tsx, src/components/landing/hero.tsx
 * e app/login/page.tsx.
 */
const sloganParts = {
  first: "Sua câmera vê,",
  second: "o MonitorIA lembra!",
} as const;

export const appConfig = {
  name: "MonitorIA.cam",
  productName: "MonitorIA",
  sloganParts,
  slogan: `${sloganParts.first} ${sloganParts.second}`,
  description:
    "Transforme câmeras comuns em uma memória visual pesquisável, com acontecimentos organizados por inteligência artificial e localização rápida do trecho original.",
  shortDescription:
    "Memória visual pesquisável para câmeras de segurança comuns.",
  domain: "monitoria.cam",
  url: "https://monitoria.cam",
  company: "BigCorps",
  legal: {
    legalName: "BigCorps Tecnologia LTA",
    tradeName: "Intermediações de Pagamento BigCorps",
    taxId: "14.282.244/0001-19",
    address:
      "Rua Saguairu, 921/925, Casa Verde, São Paulo/SP, CEP 02514-000",
    legalEmail: "contato@bigcorps.com.br",
    privacyEmail: "contato@bigcorps.com.br",
    securityEmail: "contato@bigcorps.com.br",
    institutionalPhone: "+55 11 92682-8418",
    institutionalPhoneHref: "tel:+5511926828418",
    dataOfficer: {
      name: "Ithiel Almeida",
      role: "Software Engineer",
      phone: "+55 11 96995-5552",
      phoneHref: "tel:+5511969955552",
    },
    legalRepresentative: {
      name: "Ithiel Almeida",
      role: "Empresário",
    },
    jurisdiction: "Foro da Comarca de São Paulo/SP",
  },
  locale: "pt_BR",
  language: "pt-BR",
  whatsappNumber: "5511926828418",
  whatsappUrl: `https://wa.me/5511926828418?text=${whatsappMessage}`,
  version: "0.8.2",
} as const;

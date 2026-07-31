const whatsappMessage = encodeURIComponent(
  "Olá! Quero saber mais sobre o MonitorIA.cam para as câmeras do meu negócio.",
);

export const appConfig = {
  name: "MonitorIA.cam",
  productName: "MonitorIA",
  slogan: "Sua câmera vê. A MonitorIA lembra.",
  description:
    "Transforme câmeras comuns em uma memória visual pesquisável, com acontecimentos organizados por inteligência artificial e localização rápida do trecho original.",
  shortDescription:
    "Memória visual pesquisável para câmeras de segurança comuns.",
  domain: "monitoria.cam",
  url: "https://monitoria.cam",
  company: "BigCorps",
  locale: "pt_BR",
  language: "pt-BR",
  whatsappNumber: "5511926828418",
  whatsappUrl: `https://wa.me/5511926828418?text=${whatsappMessage}`,
  version: "0.8.2",
} as const;

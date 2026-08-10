import type { MetadataRoute } from "next";
import { appConfig } from "@/src/lib/app-config";

/**
 * Manifest do PWA — servido em /manifest.webmanifest
 *
 * É a fonte que o Bubblewrap lê para gerar o projeto Android da TWA. Campos
 * que o Bubblewrap usa diretamente: name, short_name, start_url, scope,
 * display, theme_color, background_color, orientation e icons (em especial
 * o ícone com purpose "maskable").
 *
 * `start_url` e `scope` continuam relativos de propósito: são resolvidos
 * contra a origem que serve o manifest, então em produção viram
 * https://monitoria.cam/ automaticamente. Não troque por URL absoluta.
 *
 * IMPORTANTE: qualquer mudança em name, short_name, start_url, scope ou
 * ícones exige rodar `bubblewrap update` e publicar uma versão nova. O app
 * já instalado no aparelho não acompanha sozinho.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Identidade estável do PWA. Sem isso, mudar start_url faz o navegador
    // achar que é outro aplicativo e duplicar a instalação.
    id: "/",

    // O nome longo com o slogan ficava estranho como rótulo de aplicativo.
    // Nome completo em name, rótulo curto do lançador em short_name.
    name: appConfig.name,
    short_name: appConfig.productName,
    description: appConfig.shortDescription,

    /*
     * Abre em /login, não na landing.
     *
     * Dois motivos. O primeiro é de produto: quem instalou o aplicativo já
     * decidiu comprar, e abrir numa página de vendas toda vez é estranho.
     * /login manda quem já tem sessão direto para /dashboard.
     *
     * O segundo é de privacidade: a landing carrega o Microsoft Clarity,
     * que grava sessão. Passando por ela, o aplicativo teria de declarar à
     * Play Store compartilhamento de dados com terceiros. Fora do caminho
     * do app, o Clarity continua medindo o site normalmente — o funil de
     * marketing não perde nada.
     *
     * `scope` continua em "/" para o aplicativo poder navegar por todo o
     * domínio sem sair da janela.
     */
    start_url: "/login",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: appConfig.language,
    dir: "ltr",
    categories: ["business", "productivity", "utilities"],

    background_color: "#07111F",
    theme_color: "#07111F",

    // Não sugerir aplicativo nativo no lugar do PWA.
    prefer_related_applications: false,

    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Ícone adaptativo do Android. O ícone "any" tem só 3,5% de margem e
        // fundo transparente: sob a máscara circular ele seria cortado nas
        // bordas e ficaria com buraco no lugar do fundo. Este aqui tem fundo
        // sólido e o conteúdo em 56% do lado, dentro da zona segura de 80%.
        src: "/maskable-icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

import { appConfig } from "@/src/lib/app-config";
import { faq } from "@/src/lib/landing-content";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${appConfig.url}/#organization`,
      name: appConfig.company,
      url: appConfig.url,
      logo: {
        "@type": "ImageObject",
        url: `${appConfig.url}/android-chrome-512x512.png`,
        width: 512,
        height: 512,
      },
    },
    {
      "@type": "WebSite",
      "@id": `${appConfig.url}/#website`,
      url: appConfig.url,
      name: appConfig.name,
      alternateName: appConfig.productName,
      description: appConfig.description,
      inLanguage: appConfig.language,
      publisher: { "@id": `${appConfig.url}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${appConfig.url}/#software`,
      name: appConfig.name,
      alternateName: appConfig.productName,
      url: appConfig.url,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "VideoAnalyticsApplication",
      operatingSystem: "Web, Windows 10, Windows 11, Linux.",
      inLanguage: appConfig.language,
      description: appConfig.description,
      provider: { "@id": `${appConfig.url}/#organization` },
      image: `${appConfig.url}/opengraph-image`,
      /*
       * Aqui o vocabulário técnico é bem-vindo: esta lista é lida por
       * mecanismo de busca, não por cliente. Os seis últimos itens
       * correspondem à nova seção "Ele não só guarda. Ele entende."
       */
      featureList: [
        "Organização automática de acontecimentos captados por câmeras",
        "Pesquisa em português sobre eventos visuais",
        "Localização do horário exato para conferência no DVR",
        "Descrição de movimentações, entregas, objetos e veículos",
        "Funcionamento com câmeras, DVRs e NVRs já instalados",
        "Compatibilidade com câmeras que expõem vídeo por ONVIF ou RTSP",
        "Credenciais de câmera mantidas no computador local",
        "Sem reconhecimento facial no produto padrão",
        "Agrupamento de eventos em sessões de atendimento, entrega e visita",
        "Aprendizado da rotina de abertura e fechamento com alerta de desvio",
        "Diagnóstico de saúde da câmera: lente obstruída, imagem congelada, enquadramento alterado",
        "Acompanhamento de estado visual de portões, portas e cofres",
        "Perfil operacional de equipe por padrão de turno, sem biometria",
        "Continuidade de pessoas e veículos entre acontecimentos diferentes",
        "Consulta às câmeras por assistentes externos via MCP",
      ],
      areaServed: {
        "@type": "Country",
        name: "Brasil",
      },
      // Preços congelados no PLANO-DE-PRODUCAO.md §3.2.
      // Mantenha em sincronia com src/lib/landing-content.ts.
      offers: [
        {
          "@type": "Offer",
          name: "Câmera Essencial",
          price: "39.90",
          priceCurrency: "BRL",
          category: "SubscriptionService",
          availability: "https://schema.org/InStock",
          url: `${appConfig.url}/#planos`,
          description:
            "Por câmera, por mês. 365 dias de histórico pesquisável e 1 imagem por acontecimento.",
        },
        {
          "@type": "Offer",
          name: "Câmera Atenta",
          price: "79.90",
          priceCurrency: "BRL",
          category: "SubscriptionService",
          availability: "https://schema.org/InStock",
          url: `${appConfig.url}/#planos`,
          description:
            "Por câmera, por mês. 365 dias de histórico pesquisável e 2 imagens por acontecimento.",
        },
        {
          "@type": "Offer",
          name: "Câmera Detalhada",
          price: "149.90",
          priceCurrency: "BRL",
          category: "SubscriptionService",
          availability: "https://schema.org/InStock",
          url: `${appConfig.url}/#planos`,
          description:
            "Por câmera, por mês. 365 dias de histórico, 3 imagens por acontecimento e clipe de 15 segundos guardado por 30 dias.",
        },
      ],
      // §3.3 — o teste gratuito é uma oferta distinta, não um preço zero dos planos.
      isRelatedTo: {
        "@type": "Offer",
        name: "Teste gratuito",
        price: "0",
        priceCurrency: "BRL",
        description:
          "1 câmera, 24 horas de análise real, 7 dias para explorar os resultados e 21 perguntas ao Assistente. Sem cartão de crédito.",
      },
    },
    /*
     * FAQPage gerado a partir do mesmo array que a página renderiza.
     * Assim a marcação nunca sai de sincronia com o texto visível — que é
     * exatamente o que o Google exige para exibir o rich result.
     */
    {
      "@type": "FAQPage",
      "@id": `${appConfig.url}/#faq`,
      inLanguage: appConfig.language,
      isPartOf: { "@id": `${appConfig.url}/#website` },
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a,
        },
      })),
    },
  ],
};

export function MonitoriaStructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
      }}
    />
  );
}

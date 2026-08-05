import { appConfig } from "@/src/lib/app-config";

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
      featureList: [
        "Organização automática de acontecimentos captados por câmeras",
        "Pesquisa em português sobre eventos visuais",
        "Localização do horário exato para conferência no DVR",
        "Descrição de movimentações, entregas, objetos e veículos",
        "Funcionamento com câmeras e DVRs já instalados",
        "Credenciais de câmera mantidas no computador local",
        "Sem reconhecimento facial no produto padrão",
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
          "1 câmera, 24 horas de análise real, 7 dias para explorar os resultados e 21 interações com o Assistente IA. Sem cartão de crédito.",
      },
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

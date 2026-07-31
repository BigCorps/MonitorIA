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
      operatingSystem: "Web, Windows",
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

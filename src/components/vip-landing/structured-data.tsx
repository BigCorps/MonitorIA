import type { VipPlanCatalogEntry } from "@/src/vip/types";
import { vipConfig } from "@/src/vip/config";
import { vipFaq } from "@/src/lib/vip-landing-content";

export function VipStructuredData({
  plans,
}: {
  plans: VipPlanCatalogEntry[];
}) {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${vipConfig.url}/#website`,
        url: vipConfig.url,
        name: vipConfig.productName,
        alternateName: "MonitorIA.cam VIP",
        description:
          "Inteligência operacional para grandes empresas, empresas de segurança e projetos científicos com 10 ou mais câmeras.",
        inLanguage: "pt-BR",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${vipConfig.url}/#software`,
        name: vipConfig.productName,
        url: vipConfig.url,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "VideoAnalyticsApplication",
        operatingSystem: "Web, Windows 10, Windows 11, Linux",
        inLanguage: "pt-BR",
        provider: {
          "@type": "Organization",
          name: "BigCorps",
          url: "https://bigcorps.com.br",
        },
        description:
          "Monitoramento com IA para operações em escala, com Pesquisa IA, inteligência entre câmeras, saúde operacional, projetos multiambiente e implantação assistida.",
        areaServed: {
          "@type": "Country",
          name: "Brasil",
        },
        offers: plans.map((plan) => ({
          "@type": "Offer",
          name: plan.displayName,
          price: (plan.monthlyAmountCents / 100).toFixed(2),
          priceCurrency: "BRL",
          category: "SubscriptionService",
          availability: "https://schema.org/InStock",
          url: `${vipConfig.url}/#planos`,
          description: `${plan.includedCameras} câmeras incluídas em modo Intensive. Excedentes a R$ ${(plan.excessCameraMonthlyCents / 100).toFixed(2)} por câmera/mês.`,
        })),
      },
      {
        "@type": "FAQPage",
        "@id": `${vipConfig.url}/#faq`,
        inLanguage: "pt-BR",
        mainEntity: vipFaq.map((item) => ({
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

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

import { MarketingPage, marketingStyles } from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

const faqs = [
  {
    question: "Preciso trocar minhas câmeras ou o DVR?",
    answer: "Não necessariamente. O MonitorIA.cam foi pensado para aproveitar equipamentos existentes que disponibilizem um fluxo acessível na rede local, normalmente via RTSP. A compatibilidade é validada durante a instalação.",
  },
  {
    question: "O MonitorIA.cam grava todo o vídeo na nuvem?",
    answer: "Não. A gravação contínua continua no DVR ou NVR do cliente. O sistema envia somente quadros selecionados de acontecimentos para análise e armazena os metadados necessários para pesquisa.",
  },
  {
    question: "A senha da câmera é enviada para a inteligência artificial?",
    answer: "Não. As credenciais RTSP permanecem protegidas no computador local que executa o Agent e não fazem parte das imagens ou instruções enviadas ao modelo de IA.",
  },
  {
    question: "O sistema faz reconhecimento facial?",
    answer: "O produto padrão não realiza reconhecimento facial. Ele pode descrever características visíveis dentro de um evento, mas não identifica a pessoa nem mantém uma identidade entre acontecimentos diferentes.",
  },
  {
    question: "A IA consegue dizer quantos clientes únicos entraram?",
    answer: "Não com segurança usando apenas eventos independentes. O sistema apresenta aparições estimadas. Uma mesma pessoa pode aparecer mais de uma vez, por isso os números não devem ser tratados como clientes únicos.",
  },
  {
    question: "O MonitorIA.cam substitui o sistema de segurança?",
    answer: "Não. Ele funciona como uma camada de organização e pesquisa sobre as câmeras. Alarmes, gravação, vigilância humana e procedimentos de segurança continuam tendo funções próprias.",
  },
  {
    question: "Consigo pesquisar em português?",
    answer: "Sim. O assistente interpreta perguntas sobre períodos, câmeras, locais, movimento, entregas, objetos, veículos e outras categorias sustentadas pelos eventos registrados.",
  },
  {
    question: "Por quanto tempo os acontecimentos ficam disponíveis?",
    answer: "A retenção depende do plano e da política configurada. Metadados podem permanecer disponíveis por mais tempo que o vídeo original do DVR, enquanto frames temporários possuem prazos menores.",
  },
];

export const metadata = createPageMetadata({
  title: "Perguntas frequentes",
  description: "Respostas sobre câmeras compatíveis, DVR, gravação em nuvem, reconhecimento facial, privacidade, pesquisa e funcionamento do MonitorIA.cam.",
  path: "/faq",
  keywords: ["dúvidas câmera com IA", "MonitorIA.cam FAQ", "IA para DVR perguntas"],
});

export default function FaqPage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <MarketingPage
      eyebrow="Perguntas frequentes"
      title="Dúvidas comuns sobre câmeras, DVR, IA e privacidade."
      lead="As respostas abaixo explicam o funcionamento atual do MonitorIA.cam e os limites que devem ser considerados antes da instalação."
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }}
      />
      <section className={marketingStyles.faq}>
        {faqs.map((faq) => (
          <details key={faq.question}>
            <summary>{faq.question}</summary>
            <p>{faq.answer}</p>
          </details>
        ))}
      </section>
    </MarketingPage>
  );
}

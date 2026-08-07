import { ContentSection, MarketingPage, Prose } from "@/src/components/marketing/content-page";
import { appConfig } from "@/src/lib/app-config";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Central de ajuda",
  description: "Guias de conexão, diagnóstico e suporte do MonitorIA.cam para câmeras, DVR e NVR.",
  path: "/ajuda",
});

const guides = [
  { name: "Intelbras e Dahua", steps: "Confirme ONVIF ou RTSP no equipamento, crie um usuário exclusivo de leitura e selecione o canal correto do DVR." },
  { name: "Hikvision", steps: "Ative ONVIF quando disponível, crie um usuário próprio para integração e confirme o stream principal ou secundário do canal." },
  { name: "ONVIF genérico", steps: "Mantenha câmera e Agent na mesma rede, confirme data/hora do equipamento e use descoberta ONVIF antes do cadastro manual." },
  { name: "DVR/NVR com vários canais", steps: "Cada canal é cadastrado como uma câmera. Nomeie os canais pelo local físico para facilitar alertas, busca e diagnóstico." },
];

export default function HelpPage() {
  return (
    <MarketingPage eyebrow="Central de ajuda" title="Conexão, diagnóstico e atendimento em um só lugar." lead="Comece pelos passos abaixo. Se precisar falar com a equipe, exporte o diagnóstico no painel; nunca envie a senha RTSP.">
      <ContentSection label="Primeiros passos" title="Antes de conectar uma câmera"><Prose><ol><li>Instale o Agent em um computador que permaneça ligado.</li><li>Deixe o computador e o DVR, NVR ou câmera na mesma rede.</li><li>Crie no equipamento um usuário exclusivo com acesso somente ao vídeo.</li><li>Faça o pareamento no painel e valide o estado da câmera.</li></ol></Prose></ContentSection>
      {guides.map((guide) => <ContentSection label="Guia por fabricante" title={guide.name} key={guide.name}><Prose><p>{guide.steps}</p><p>Os nomes dos menus variam por modelo e firmware. Consulte também o manual do fabricante.</p></Prose></ContentSection>)}
      <ContentSection label="Atendimento" title="Envie contexto, não credenciais"><Prose><p>Informe o nome do local, o modelo do equipamento e o código de erro. O diagnóstico exportável do painel já reúne o restante sem expor credenciais.</p><p><a href={appConfig.whatsappUrl} target="_blank" rel="noopener noreferrer">Abrir atendimento pelo WhatsApp</a> · <a href="/status">Ver status dos serviços</a> · <a href="/faq">Perguntas frequentes</a></p></Prose></ContentSection>
    </MarketingPage>
  );
}


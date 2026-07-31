import { CardGrid, ContentSection, InfoCard, MarketingPage, Prose } from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Monitoramento inteligente para comércios",
  description: "Use as câmeras do comércio para pesquisar movimento, abertura, entregas, atendimentos e acontecimentos sem assistir horas de gravação.",
  path: "/para-comercios",
  keywords: ["câmeras para comércio com IA", "monitoramento inteligente de loja", "análise de movimento em loja"],
});

export default function ParaComerciosPage() {
  return (
    <MarketingPage
      eyebrow="Para comércios"
      title="As câmeras podem ajudar na operação, não apenas depois de um problema."
      lead="Lojas, oficinas, postos, mercados e outros negócios podem usar o histórico visual para localizar situações, conferir rotinas e entender períodos de maior movimento."
    >
      <ContentSection label="Perguntas" title="Exemplos do que o responsável pode pesquisar.">
        <CardGrid>
          <InfoCard label="Abertura" title="A que horas o local abriu?">Localize os primeiros sinais de atividade observados pela câmera configurada.</InfoCard>
          <InfoCard label="Movimento" title="Qual foi o horário mais movimentado?">Compare a quantidade de eventos por hora ou entre períodos diferentes.</InfoCard>
          <InfoCard label="Entregas" title="Quando o fornecedor chegou?">Busque registros relacionados a entregadores, pacotes, caixas e veículos.</InfoCard>
          <InfoCard label="Atendimento" title="Houve interação no balcão?">Encontre eventos com sinais visuais de interação em uma área de atendimento.</InfoCard>
          <InfoCard label="Objetos" title="Quando algo saiu do lugar?">Localize alterações visíveis em zonas previamente configuradas.</InfoCard>
          <InfoCard label="Fora do horário" title="Houve movimento depois do fechamento?">Filtre acontecimentos em horários em que o ambiente deveria estar vazio.</InfoCard>
        </CardGrid>
      </ContentSection>

      <ContentSection label="Uso responsável" title="Indicadores visuais precisam ser interpretados corretamente.">
        <Prose>
          <p>Uma mesma pessoa pode aparecer em vários eventos, portanto contagens representam aparições estimadas, não clientes únicos. Da mesma forma, sinais de atendimento não comprovam venda, pagamento ou qualidade do serviço.</p>
          <p>O valor está em reduzir o tempo de procura, organizar evidências e oferecer uma visão operacional que antes ficava presa nas gravações.</p>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}

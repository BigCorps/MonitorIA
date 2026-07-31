import { ContentSection, MarketingPage, Note, Prose } from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Termos de uso",
  description: "Termos de uso do MonitorIA.cam sobre contratação, instalação, limites da análise visual, responsabilidades, disponibilidade e propriedade intelectual.",
  path: "/termos",
});

export default function TermosPage() {
  return (
    <MarketingPage
      eyebrow="Termos de uso"
      title="Condições gerais para utilização do MonitorIA.cam."
      lead="Última atualização: 31 de julho de 2026. Ao contratar ou utilizar o serviço, a organização declara ter lido e aceito estes termos e as condições comerciais aplicáveis."
    >
      <ContentSection label="Termos" title="Regras gerais do serviço.">
        <Prose>
          <h2>1. Serviço</h2>
          <p>O MonitorIA.cam oferece uma camada de análise e pesquisa sobre câmeras compatíveis. O serviço pode incluir Agent local, painel, análise visual, armazenamento de metadados, relatórios e assistente.</p>

          <h2>2. Não substituição da segurança</h2>
          <p>O MonitorIA.cam não substitui DVR, NVR, alarmes, vigilância humana, controle de acesso, procedimentos de emergência ou avaliação profissional de segurança.</p>

          <h2>3. Limites da inteligência artificial</h2>
          <p>Resultados podem conter omissões, erros ou interpretações incompletas. Iluminação, enquadramento, resolução, obstruções, movimento e qualidade do equipamento afetam a análise. Decisões relevantes devem considerar a gravação original e outras evidências.</p>

          <h2>4. Uso proibido</h2>
          <p>É proibido utilizar o serviço para atividades ilegais, perseguição, discriminação, identificação biométrica não autorizada, invasão de sistemas, violação de direitos ou monitoramento sem base legal.</p>

          <h2>5. Obrigações do cliente</h2>
          <p>O cliente é responsável pelas câmeras, rede, energia, computador do Agent, credenciais, avisos de monitoramento, bases legais, usuários autorizados e legitimidade das instruções fornecidas ao sistema.</p>

          <h2>6. Conta e acesso</h2>
          <p>Credenciais de acesso são pessoais e devem ser protegidas. O cliente deve comunicar uso indevido, manter usuários atualizados e remover acessos que não sejam mais necessários.</p>

          <h2>7. Planos, limites e pagamento</h2>
          <p>Valores, quantidade de locais, câmeras, eventos, modos, retenção, suporte e serviços de implantação serão definidos na proposta ou contratação vigente.</p>

          <h2>8. Disponibilidade</h2>
          <p>Buscamos manter o serviço disponível, mas podem ocorrer manutenções, falhas de internet, indisponibilidade de fornecedores, incompatibilidades de equipamento ou interrupções fora do nosso controle.</p>

          <h2>9. Propriedade intelectual</h2>
          <p>O software, marca, interface, documentação, modelos de dados e componentes do MonitorIA.cam pertencem à BigCorps ou a seus licenciadores. O cliente mantém os direitos sobre os dados e conteúdos que legitimamente fornece.</p>

          <h2>10. Suspensão e encerramento</h2>
          <p>O acesso pode ser suspenso por inadimplência, risco de segurança, abuso, violação destes termos ou exigência legal. O tratamento dos dados após encerramento seguirá a política de privacidade e as condições contratadas.</p>

          <h2>11. Alterações</h2>
          <p>Os termos podem ser atualizados para refletir mudanças no serviço ou na legislação. Mudanças relevantes poderão ser comunicadas pelos canais cadastrados.</p>

          <Note>Este texto é uma base operacional e deve ser revisado juridicamente antes da contratação comercial ampla, especialmente quanto a CNPJ, foro, responsabilidade, SLA, cancelamento e regras de pagamento.</Note>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}

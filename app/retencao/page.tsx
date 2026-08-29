import Link from "next/link";
import {
  ContentSection,
  MarketingPage,
  Note,
  Prose,
} from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Política de retenção e exclusão",
  description:
    "Critérios de retenção, expurgo e exclusão segura de dados no MonitorIA.cam.",
  path: "/retencao",
});

export default function RetencaoPage() {
  return (
    <MarketingPage
      eyebrow="Retenção e exclusão"
      title="Guardamos cada categoria somente pelo período necessário."
      lead="Versão de 29 de agosto de 2026. Os prazos efetivos dependem do plano, da configuração da organização, de obrigação legal e de preservação formalmente justificada."
    >
      <ContentSection label="Ciclo de vida" title="Prazos por categoria e critérios de descarte.">
        <Prose>
          <h2>1. Gravação contínua</h2>
          <p>
            O vídeo contínuo permanece no DVR, NVR, câmera ou ambiente local do
            cliente e segue a política configurada nesse equipamento. O
            MonitorIA.cam não copia essa gravação integral para a nuvem.
          </p>

          <h2>2. Frames temporários</h2>
          <p>
            Imagens selecionadas para processamento têm retenção curta. A política
            padrão atualmente configurada no serviço é de <strong>3 dias</strong>,
            salvo classe, plano ou configuração aplicável ao evento. Frames podem
            ser promovidos a evidência quando fazem parte de um acontecimento que
            precisa ser preservado.
          </p>

          <h2>3. Keyframes e metadados de acontecimentos</h2>
          <p>
            A referência operacional padrão é de <strong>365 dias</strong> para
            keyframes preservados e <strong>365 dias</strong> para metadados dos
            acontecimentos. Eventos carregam um snapshot da política aplicável,
            permitindo que a expiração respeite o contexto da organização no
            momento do processamento.
          </p>

          <h2>4. Clipes preservados</h2>
          <p>
            Vídeos curtos preservados como evidência usam atualmente {" "}
            <strong>30 dias</strong> como referência padrão. O vídeo integral do
            DVR continua fora da nuvem do MonitorIA e pode ter retenção diferente,
            definida no equipamento do cliente.
          </p>

          <h2>5. Memória operacional e perfis</h2>
          <p>
            Memória curta de pessoas e veículos utiliza janelas configuradas por
            câmera e campos próprios de expiração. Instâncias temporárias deixam
            de ser ativas quando expiram e são elegíveis a limpeza conforme o
            ciclo de manutenção. Candidatos e perfis operacionais de equipe seguem
            configurações e estados próprios de revisão, aprovação e expiração.
          </p>

          <h2>6. Telemetria do Agent</h2>
          <p>
            Amostras brutas de saúde do Agent — como estado, CPU, memória, espaço
            livre e tamanho da fila — são normalmente mantidas por {" "}
            <strong>7 dias</strong>. Antes do descarte, podem ser consolidadas por
            hora; esses agregados podem ser mantidos por até {" "}
            <strong>365 dias</strong> para histórico de disponibilidade e suporte.
          </p>

          <h2>7. Conta, faturamento, segurança e auditoria</h2>
          <p>
            Dados de conta são mantidos durante a relação contratual e pelo tempo
            necessário ao encerramento. Registros de segurança, faturamento,
            auditoria, prevenção de fraude e defesa de direitos podem seguir
            prazos próprios exigidos ou permitidos pela legislação e pelos
            contratos aplicáveis.
          </p>

          <h2>8. Exclusão e expurgo</h2>
          <p>
            A exclusão lógica retira conteúdo das consultas normais. Objetos de
            armazenamento e registros elegíveis são removidos pelo processo de
            expurgo depois de cumpridas as dependências de integridade. Dados de
            trial possuem ciclo próprio e podem ser expurgados depois de encerrado
            o período de trial e a janela operacional de limpeza.
          </p>

          <h2>9. Preservação excepcional</h2>
          <p>
            Uma solicitação de preservação, disputa, investigação, prevenção de
            fraude ou obrigação legal pode suspender o descarte somente do escopo
            necessário. O acesso permanece restrito e auditado.
          </p>

          <h2>10. Solicitações</h2>
          <p>
            Usuários autenticados podem abrir protocolo em {" "}
            <Link href="/dashboard/profile">Perfil e empresa</Link>. Titulares
            captados pelas câmeras devem procurar primeiro a organização
            responsável pelo local monitorado quando a solicitação se refere ao
            monitoramento realizado por ela.
          </p>

          <Note>
            3/365/365/30 dias são os valores padrão atualmente configurados para
            frames temporários, keyframes, metadados e clipes preservados. O prazo
            efetivo pode variar conforme plano, política da organização, classe do
            ativo e obrigação de preservação.
          </Note>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}

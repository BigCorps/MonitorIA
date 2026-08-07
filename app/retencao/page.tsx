import Link from "next/link";
import { ContentSection, MarketingPage, Note, Prose } from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Política de retenção e exclusão",
  description: "Critérios de retenção, expurgo e exclusão segura de dados no MonitorIA.cam.",
  path: "/retencao",
});

export default function RetencaoPage() {
  return (
    <MarketingPage
      eyebrow="Retenção e exclusão"
      title="Guardamos cada categoria somente pelo período necessário."
      lead="Versão de 7 de agosto de 2026. Os prazos efetivos dependem do plano, da configuração da organização, de obrigação legal e de preservação formalmente justificada."
    >
      <ContentSection label="Ciclo de vida" title="Prazos por categoria e critérios de descarte.">
        <Prose>
          <h2>1. Gravação contínua</h2>
          <p>O vídeo contínuo permanece no DVR, NVR ou ambiente do cliente e segue a política configurada nesse equipamento. O MonitorIA.cam não copia essa gravação integral para a nuvem.</p>

          <h2>2. Frames temporários</h2>
          <p>Imagens selecionadas para análise usam retenção curta, normalmente de 1 a 30 dias. Elas são eliminadas quando expiram, salvo preservação vinculada a um evento ou obrigação válida.</p>

          <h2>3. Evidências e metadados</h2>
          <p>Keyframes preservados, eventos estruturados, sessões, rotinas e registros operacionais seguem a política da organização, normalmente entre 1 e 3.650 dias. O painel mostra a configuração aplicável.</p>

          <h2>4. Conta, segurança e auditoria</h2>
          <p>Dados de conta são mantidos durante a relação contratual e pelo tempo necessário ao encerramento. Registros de segurança, faturamento, auditoria e defesa de direitos podem seguir prazos próprios.</p>

          <h2>5. Exclusão</h2>
          <p>A exclusão lógica retira o conteúdo das consultas normais; o expurgo remove objetos de armazenamento e registros elegíveis. Cópias de segurança deixam de conter o dado conforme o ciclo de rotação e não são restauradas para uso comum.</p>

          <h2>6. Preservação excepcional</h2>
          <p>Uma solicitação de preservação, disputa, investigação ou obrigação legal pode suspender o descarte apenas do escopo necessário. O acesso continua restrito e auditado.</p>

          <h2>7. Solicitações</h2>
          <p>Usuários autenticados podem abrir um protocolo em <Link href="/dashboard/profile">Perfil e empresa</Link>. Titulares captados pelas câmeras devem procurar primeiro a organização responsável pelo local monitorado.</p>

          <Note>Os prazos descritos são limites operacionais do produto e não substituem a definição documentada da base legal e da necessidade de cada cliente.</Note>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}

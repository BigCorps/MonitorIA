import Link from "next/link";
import { requireCommercialAccess } from "@/src/lib/commercial-operator";
import { VipInviteCopy } from "../invite-copy";
import { getVipPlanCatalog } from "@/src/vip/server";
import { vipConfig } from "@/src/vip/config";
import { vipAssistAlias } from "@/src/vip/assisted";
import { createVipAssistedPresentationAction } from "./actions";
import styles from "./new-presentation.module.css";

export const metadata = { title: "Nova apresentação VIP | MonitorIA" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

export default async function NewVipPresentationPage({ searchParams }: Props) {
  const [access, plans, query] = await Promise.all([
    requireCommercialAccess(),
    getVipPlanCatalog(),
    searchParams,
  ]);

  const token = first(query.token);
  const projectId = first(query.project);
  const inviteId = first(query.invite);
  const company = first(query.company);
  const message = first(query.message);
  const error = first(query.error);
  const presentationUrl = token
    ? `${vipConfig.url}/apresentacao/${encodeURIComponent(token)}`
    : null;
  const alias = inviteId ? vipAssistAlias(inviteId) : null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>VENDA CONSULTIVA · MONITORIA VIP</span>
          <h1>Nova apresentação assistida</h1>
          <p>
            Gere um link individual para apresentar a landing junto com o lead e
            continuar acompanhando instalação, piloto e fechamento.
          </p>
        </div>
        <aside>
          <small>{access.isManager ? "Administrador" : "Especialista VIP"}</small>
          <strong>{access.operator?.name ?? access.user.email}</strong>
        </aside>
      </header>

      <section className={styles.content}>
        {message ? <div className={styles.success}>{message}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        {presentationUrl && projectId ? (
          <section className={styles.ready}>
            <div>
              <span>LINK INDIVIDUAL PRONTO</span>
              <h2>{company || "Projeto MonitorIA VIP"}</h2>
              <p>
                Envie este link ao lead. Ele abre a landing VIP em modo acompanhado,
                sem formulário de contato, e termina em “Estou pronto. Vamos começar”.
              </p>
              {alias ? (
                <p className={styles.alias}>
                  Identificador da sessão/Clarity: <strong>{alias}</strong>
                </p>
              ) : null}
            </div>
            <div className={styles.linkBox}>
              <input value={presentationUrl} readOnly />
              <VipInviteCopy url={presentationUrl} />
              <a href={presentationUrl} target="_blank" rel="noreferrer">
                Abrir apresentação
              </a>
              <Link href={`/comercial/vip/${projectId}/acompanhar`}>
                Acompanhar lead
              </Link>
            </div>
            <small className={styles.security}>
              O token de ativação nunca aparece dentro da landing nem é enviado ao
              Clarity. Ele só existe neste link inicial e em cookie HttpOnly.
            </small>
          </section>
        ) : null}

        <section className={styles.grid}>
          <form action={createVipAssistedPresentationAction} className={styles.form}>
            <div className={styles.formHeading}>
              <span>LEAD JÁ CONTATADO</span>
              <h2>Prepare a apresentação</h2>
              <p>Não é necessário mandar o comprador preencher a landing primeiro.</p>
            </div>

            <div className={styles.twoCols}>
              <label>
                <span>Nome do lead</span>
                <input name="lead_name" minLength={2} maxLength={120} required />
              </label>
              <label>
                <span>E-mail</span>
                <input name="lead_email" type="email" required />
              </label>
              <label>
                <span>Empresa / projeto</span>
                <input name="company_name" minLength={2} maxLength={160} required />
              </label>
              <label>
                <span>Quantidade aproximada de câmeras</span>
                <input name="expected_camera_count" type="number" min={10} max={100000} defaultValue={10} required />
              </label>
              <label>
                <span>Tipo de projeto</span>
                <select name="project_kind" defaultValue="enterprise">
                  <option value="enterprise">Média / grande empresa</option>
                  <option value="large_monitoring">Empresa / central de segurança</option>
                  <option value="scientific">Projeto científico</option>
                  <option value="other">Outro projeto especial</option>
                </select>
              </label>
              <label>
                <span>Pacote inicial</span>
                <select name="plan_code" defaultValue="vip10">
                  {plans.map((plan) => (
                    <option value={plan.code} key={plan.code}>
                      {plan.displayName} · {plan.includedCameras} incluídas
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              <span>O que esse lead quer enxergar melhor? (opcional)</span>
              <textarea name="objective" rows={5} maxLength={2000} />
            </label>

            <button type="submit">Criar apresentação + Projeto VIP</button>
            <small>
              O pacote continua podendo ser ajustado na proposta. O piloto permanece
              em 60 minutos, com até 6 câmeras, todas Intensive.
            </small>
          </form>

          <aside className={styles.explainer}>
            <span>COMO O VENDEDOR ACOMPANHA</span>
            <h2>Uma venda guiada, sem espelhar a câmera do cliente.</h2>
            <ol>
              <li><b>Landing:</b> veja se o lead abriu e em qual seção está. No Clarity, o mesmo identificador permite abrir a gravação ao vivo da página pública.</li>
              <li><b>Implantação:</b> acompanhe progresso, próxima ação, Agents, câmeras encontradas e prontidão.</li>
              <li><b>Piloto:</b> veja o mesmo relógio, câmeras online, acontecimentos, vídeos preservados e uso da Pesquisa IA.</li>
              <li><b>Privacidade:</b> o vendedor não recebe senha, RTSP, imagens privadas nem stream da câmera.</li>
            </ol>
          </aside>
        </section>
      </section>
    </main>
  );
}

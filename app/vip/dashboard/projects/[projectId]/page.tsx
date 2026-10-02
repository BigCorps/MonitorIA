import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getVipProjectWorkspace } from "@/src/vip/dashboard";
import { assignVipCameraAction, removeVipCameraAction } from "./actions";
import styles from "../../vip-dashboard.module.css";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}
function date(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "medium" }).format(new Date(value));
}
function source(value: string) {
  return value === "local_recording" ? "Gravação local" : "Câmera conectada";
}
function role(value: string) {
  return ({ owner: "Proprietário", admin: "Administrador", operator: "Operador", researcher: "Pesquisador", viewer: "Visualizador" } as Record<string,string>)[value] ?? value;
}

export default async function VipProjectPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");
  const [workspace, query] = await Promise.all([
    getVipProjectWorkspace(organization.id, projectId),
    searchParams,
  ]);
  if (!workspace) notFound();
  const canManage = ["owner", "admin"].includes(organization.role);
  const remaining = Math.max(workspace.contract.contractedCameras - workspace.cameras.length, 0);

  return (
    <div className={styles.page}>
      <header className={styles.projectHero}>
        <div>
          <Link href="/vip/dashboard">← Visão executiva</Link>
          <span>PROJETO VIP · {workspace.project.planCode.toUpperCase()}</span>
          <h1>{workspace.project.name}</h1>
          <p>{workspace.project.objective || `${workspace.project.companyName} · operação MonitorIA VIP`}</p>
        </div>
        <div className={styles.contractBadge}>
          <span>CONTRATO</span>
          <strong>{workspace.contract.status === "grace_period" ? "Período de tolerância" : "Ativo"}</strong>
          <small>{workspace.project.billingCycle === "annual" ? "Anual" : "Mensal"} · até {date(workspace.contract.periodEnd)}</small>
        </div>
      </header>

      {first(query.message) ? <div className={styles.success}>{first(query.message)}</div> : null}
      {first(query.error) ? <div className={styles.error}>{first(query.error)}</div> : null}

      <section className={styles.metrics}>
        <article><span>CÂMERAS</span><strong>{workspace.cameras.length}/{workspace.contract.contractedCameras}</strong><small>{remaining} vaga(s)</small></article>
        <article><span>INCLUÍDAS</span><strong>{workspace.contract.includedCameras}</strong><small>pacote base</small></article>
        <article><span>EXCEDENTES</span><strong>{workspace.contract.excessCameras}</strong><small>contratadas</small></article>
        <article><span>LOCAIS</span><strong>{workspace.sites.length}</strong><small>ativos</small></article>
        <article><span>EQUIPE</span><strong>{workspace.members.length}</strong><small>membros</small></article>
        <article><span>RECURSOS</span><strong>{workspace.features.filter((f) => f.enabled).length}</strong><small>habilitados</small></article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><span>ESTRUTURA DO PROJETO</span><h2>Locais e câmeras</h2></div>
          <Link href="/dashboard/cameras">Configurar câmeras →</Link>
        </div>
        <div className={styles.siteList}>
          {workspace.sites.map((site) => (
            <article key={site.id} className={styles.siteCard}>
              <header><div><span>LOCAL</span><strong>{site.name}</strong><small>{site.timezone}</small></div><b>{site.cameraCount} câmera(s)</b></header>
              <div className={styles.cameraRows}>
                {workspace.cameras.filter((camera) => camera.siteId === site.id).map((camera) => (
                  <div key={camera.id}>
                    <div><strong>{camera.name}</strong><span>{source(camera.sourceKind)} · Intensive</span></div>
                    <div className={styles.cameraState}>
                      <b data-online={camera.status === "online"}>{camera.status}</b>
                      <Link href={`/dashboard/cameras/${camera.id}`}>Configurar</Link>
                      {canManage ? (
                        <form action={removeVipCameraAction}>
                          <input type="hidden" name="project_id" value={projectId} />
                          <input type="hidden" name="camera_id" value={camera.id} />
                          <button type="submit">Remover do Projeto</button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><span>CAPACIDADE</span><h2>Adicionar câmera ao Projeto</h2></div>
          <strong>{remaining} vaga(s) disponível(is)</strong>
        </div>
        {remaining <= 0 ? (
          <div className={styles.capacityWarning}><strong>Capacidade contratada atingida.</strong><p>O limite também é aplicado no banco; duas requisições simultâneas não ultrapassam o contrato.</p></div>
        ) : workspace.eligibleCameras.length ? (
          <form action={assignVipCameraAction} className={styles.assignForm}>
            <input type="hidden" name="project_id" value={projectId} />
            <label><span>Câmera disponível</span><select name="camera_id" required>{workspace.eligibleCameras.map((camera) => <option value={camera.id} key={camera.id}>{camera.siteName} · {camera.name} · {source(camera.sourceKind)}</option>)}</select></label>
            <button type="submit" disabled={!canManage}>Vincular como Intensive</button>
          </form>
        ) : (
          <div className={styles.empty}><strong>Não há outra câmera disponível.</strong><p>Cadastre ou descubra uma câmera nas configurações e volte aqui.</p><Link href="/dashboard/cameras">Gerenciar câmeras →</Link></div>
        )}
      </section>

      <section className={styles.twoColumns}>
        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><span>EQUIPE</span><h2>Membros do Projeto</h2></div><Link href="/dashboard/administration">Gerenciar equipe →</Link></div>
          <div className={styles.memberList}>{workspace.members.map((member) => <div key={member.userId}><div><strong>{member.email ?? "Usuário MonitorIA"}</strong><small>{role(member.role)}</small></div><span>ativo</span></div>)}</div>
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><span>LABORATÓRIO VIP</span><h2>Recursos avançados</h2></div><Link href={`/vip/dashboard/beta?project=${projectId}`}>Abrir laboratório →</Link></div>
          <div className={styles.featureMiniList}>{workspace.features.map((feature) => <div key={feature.code}><span data-enabled={feature.enabled}>{feature.enabled ? "ATIVO" : "OFF"}</span><div><strong>{feature.displayName}</strong><small>{feature.stage}</small></div></div>)}</div>
        </section>
      </section>
    </div>
  );
}

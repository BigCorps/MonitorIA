import { requireInternalOperator } from "@/src/lib/internal-operator";
import { getReleaseGateOverview } from "@/src/lib/launch-readiness-data";
import { AdminShell } from "../admin-shell";
import styles from "../admin.module.css";

export const metadata = { title: "Release | Admin MonitorIA" };
export const dynamic = "force-dynamic";

const statusLabel = {
  ready: "Pronto para produção",
  blocked: "Produção bloqueada",
  not_evaluated: "Aguardando avaliação",
} as const;

const checkLabel = {
  passed: "Aprovado",
  warning: "Atenção",
  blocked: "Bloqueado",
} as const;

export default async function LaunchPage() {
  const user = await requireInternalOperator();
  const gate = await getReleaseGateOverview();

  return (
    <AdminShell admin={{ email: user.email }} active="launch" eyebrow="RELEASE · MONITORIA 1.0.3" title="Gate de produção" description="Resultado auditável da última avaliação automática da versão final publicada.">
      <section className={`${styles.releaseOverview} ${gate.status === "ready" ? styles.releaseReady : gate.status === "blocked" ? styles.releaseBlocked : styles.releaseNeutral}`}>
        <div><span>ESTADO DA RELEASE</span><h2>{statusLabel[gate.status]}</h2></div>
        <dl><div><dt>Aprovados</dt><dd>{gate.passedCount}</dd></div><div><dt>Atenções</dt><dd>{gate.warningCount}</dd></div><div><dt>Bloqueios</dt><dd>{gate.blockedCount}</dd></div></dl>
      </section>
      {!gate.available ? <div className={styles.notice}>O histórico do gate ainda não está disponível neste ambiente.</div> : null}
      <section className={styles.releaseStats}>
        <div><span>Cadastro geral</span><strong>{gate.generalSignupEnabled ? "Aberto" : "Fechado"}</strong></div>
        <div><span>Commit avaliado</span><strong>{gate.commitSha?.slice(0, 12) ?? "—"}</strong></div>
        <div><span>Última avaliação</span><strong>{gate.evaluatedAt ? new Date(gate.evaluatedAt).toLocaleString("pt-BR") : "Ainda não executada"}</strong></div>
      </section>
      <section className={styles.checkGrid}>
        {gate.checks.map((check) => (
          <article className={styles.checkCard} key={check.code}>
            <header><span>{check.area}</span><strong className={check.status === "passed" ? styles.checkPassed : check.status === "warning" ? styles.checkWarning : styles.checkBlocked}>{checkLabel[check.status]}</strong></header>
            <p>{check.detail}</p><small>{check.code}</small>
          </article>
        ))}
      </section>
    </AdminShell>
  );
}

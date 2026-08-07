import Link from "next/link";
import { requireInternalOperator } from "@/src/lib/internal-operator";
import { getReleaseGateOverview } from "@/src/lib/launch-readiness-data";
import styles from "./launch.module.css";

export const metadata = { title: "Gate de lançamento" };
export const dynamic = "force-dynamic";

const statusLabel = {
  ready: "Pronto para liberação",
  blocked: "Liberação bloqueada",
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
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/dashboard/admin">← Voltar ao painel admin</Link>
          <span>LANÇAMENTO · MONITORIA 1.0</span>
          <h1>Gate de produção</h1>
          <p>Resultado auditável da última avaliação automática. Uma pendência externa continua bloqueada até existir evidência real.</p>
        </div>
        <aside><span>Operador</span><strong>{user.email}</strong></aside>
      </header>

      <section className={`${styles.hero} ${styles[gate.status]}`}>
        <div><span>ESTADO DA RELEASE</span><h2>{statusLabel[gate.status]}</h2></div>
        <dl>
          <div><dt>Aprovados</dt><dd>{gate.passedCount}</dd></div>
          <div><dt>Atenções</dt><dd>{gate.warningCount}</dd></div>
          <div><dt>Bloqueios</dt><dd>{gate.blockedCount}</dd></div>
        </dl>
      </section>

      {!gate.available ? <p className={styles.notice}>A migration da fase 12 ainda não está disponível neste ambiente.</p> : null}
      {gate.status === "not_evaluated" && gate.available ? <p className={styles.notice}>O primeiro cron operacional após a implantação fará a avaliação.</p> : null}

      <section className={styles.releaseInfo}>
        <div><span>Cadastro geral</span><strong>{gate.generalSignupEnabled ? "Aberto" : "Fechado com liberação gradual"}</strong></div>
        <div><span>Commit avaliado</span><strong>{gate.commitSha?.slice(0, 12) ?? "Ainda não registrado"}</strong></div>
        <div><span>Última avaliação</span><strong>{gate.evaluatedAt ? new Date(gate.evaluatedAt).toLocaleString("pt-BR") : "Ainda não executada"}</strong></div>
      </section>

      <section className={styles.checks} aria-label="Verificações da release">
        {gate.checks.map((check) => (
          <article key={check.code}>
            <header><span>{check.area}</span><strong className={styles[check.status]}>{checkLabel[check.status]}</strong></header>
            <p>{check.detail}</p>
            <small>{check.code}</small>
          </article>
        ))}
      </section>
    </main>
  );
}

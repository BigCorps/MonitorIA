import Link from "next/link";
import { requireInternalOperator } from "@/src/lib/internal-operator";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  createSalesTrialInviteAction,
  revokeSalesTrialInviteAction,
} from "./actions";
import styles from "./trials.module.css";

export const metadata = { title: "Trials comerciais" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

function inviteStatus(row: any) {
  if (row.revoked_at) return "Cancelado";
  if (row.redeemed_at) return "Utilizado";
  if (new Date(String(row.expires_at)).getTime() <= Date.now()) return "Expirado";
  return "Disponível";
}

export default async function SalesTrialsAdminPage({ searchParams }: Props) {
  const operator = await requireInternalOperator();
  const query = await searchParams;
  const admin = createAdminClient();
  const { data: invites, error } = await admin
    .from("sales_trial_invites")
    .select(
      "id,lead_name,lead_email,company_name,duration_minutes,max_cameras,expires_at,redeemed_at,revoked_at,created_at,trial_run_id",
    )
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    throw new Error(`sales_trial_invites_unavailable:${error.message}`);
  }

  const token = firstValue(query.token);
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "https://monitoria.cam").replace(/\/$/, "");
  const shareUrl = token ? `${origin}/lead/${token}` : null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/dashboard/admin/customers">← Voltar para Clientes</Link>
          <span>DEMONSTRAÇÕES · BIGCORPS</span>
          <h1>Trial comercial assistido</h1>
          <p>Gere links de uso único para demonstrações de 60 minutos com até seis câmeras.</p>
        </div>
        <div className={styles.operator}>
          <span>Operador</span>
          <strong>{operator.email}</strong>
        </div>
      </header>

      <section className={styles.content}>
        {firstValue(query.message) ? <div className={styles.success}>{firstValue(query.message)}</div> : null}
        {firstValue(query.error) ? <div className={styles.error}>{firstValue(query.error)}</div> : null}

        {shareUrl ? (
          <div className={styles.shareCard}>
            <span>LINK GERADO · COPIE AGORA</span>
            <strong>{shareUrl}</strong>
            <p>Por segurança, apenas o hash do token fica salvo no banco. Se perder este link, gere outro.</p>
          </div>
        ) : null}

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span>NOVO LEAD</span>
              <h2>Criar convite comercial</h2>
            </div>
            <strong>Validade: 7 dias</strong>
          </div>

          <form action={createSalesTrialInviteAction} className={styles.form}>
            <label>
              <span>Nome do contato</span>
              <input name="lead_name" type="text" required minLength={2} />
            </label>
            <label>
              <span>E-mail</span>
              <input name="lead_email" type="email" required />
            </label>
            <label>
              <span>Empresa</span>
              <input name="company_name" type="text" />
            </label>
            <label>
              <span>Máximo de câmeras</span>
              <select name="max_cameras" defaultValue="6">
                <option value="1">1 câmera</option>
                <option value="2">2 câmeras</option>
                <option value="3">3 câmeras</option>
                <option value="4">4 câmeras</option>
                <option value="5">5 câmeras</option>
                <option value="6">6 câmeras</option>
              </select>
            </label>
            <div className={styles.fixedInfo}>
              <span>Duração</span><strong>60 minutos</strong>
              <span>Modo</span><strong>Detalhada</strong>
            </div>
            <button type="submit">Gerar link de demonstração</button>
          </form>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span>HISTÓRICO</span>
              <h2>Convites recentes</h2>
            </div>
            <strong>{invites?.length ?? 0} exibidos</strong>
          </div>

          <div className={styles.inviteList}>
            {(invites ?? []).map((invite: any) => {
              const status = inviteStatus(invite);
              return (
                <div className={styles.inviteRow} key={String(invite.id)}>
                  <div>
                    <strong>{invite.company_name || invite.lead_name}</strong>
                    <span>{invite.lead_name} · {invite.lead_email}</span>
                  </div>
                  <div className={styles.inviteMeta}>
                    <span>{invite.max_cameras} câmera(s)</span>
                    <strong>{status}</strong>
                  </div>
                  <div className={styles.rowActions}>
                    {invite.trial_run_id ? (
                      <Link
                        className={styles.resultLink}
                        href={`/dashboard/admin/customers/trials/${String(invite.trial_run_id)}/results`}
                      >
                        Ver resultado
                      </Link>
                    ) : null}
                    {status === "Disponível" ? (
                      <form action={revokeSalesTrialInviteAction}>
                        <input type="hidden" name="invite_id" value={String(invite.id)} />
                        <button className={styles.revokeButton} type="submit">Cancelar</button>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

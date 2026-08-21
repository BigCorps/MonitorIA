import Link from "next/link";
import { requireCommercialAccess } from "@/src/lib/commercial-operator";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  addSalesOperatorAction,
  createSalesTrialInviteAction,
  revokeSalesTrialInviteAction,
  setSalesOperatorActiveAction,
} from "./actions";
import styles from "./trials.module.css";

export const metadata = { title: "Área comercial | MonitorIA" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type InviteRow = {
  id: string;
  lead_name: string | null;
  lead_email: string | null;
  company_name: string | null;
  duration_minutes: number;
  max_cameras: number;
  expires_at: string;
  redeemed_at: string | null;
  revoked_at: string | null;
  created_at: string;
  trial_run_id: string | null;
  redeemed_organization_id: string | null;
  sales_operator_id: string | null;
};

type TrialRow = {
  id: string;
  status: string;
  capture_started_at: string | null;
  capture_completed_at: string | null;
  converted_at: string | null;
};

type OperatorRow = {
  id: string;
  name: string;
  email: string;
  user_id: string | null;
  active: boolean;
  last_access_at: string | null;
  created_at: string;
};

function firstValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isTrialFinished(trial: TrialRow | null) {
  if (!trial) return false;
  return Boolean(
    trial.capture_completed_at ||
      ["capture_completed", "exploration", "converted", "expired", "purged"].includes(
        trial.status,
      ),
  );
}

function stageLabel(
  invite: InviteRow,
  trial: TrialRow | null,
  converted: boolean,
) {
  if (converted) return "Convertido";
  if (invite.revoked_at) return "Cancelado";
  if (!invite.redeemed_at && new Date(invite.expires_at).getTime() <= Date.now()) {
    return "Expirado";
  }
  if (!invite.redeemed_at) return "Convite disponível";
  if (!trial) return "Conta ativada";
  if (trial.status === "running") return "Teste em andamento";
  if (isTrialFinished(trial)) return "Teste concluído";
  if (["draft", "ready"].includes(trial.status)) return "Preparando teste";
  return "Conta ativada";
}

function percentage(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export default async function SalesTrialsAdminPage({ searchParams }: Props) {
  const access = await requireCommercialAccess();
  const query = await searchParams;
  const admin = createAdminClient();

  let inviteQuery = admin
    .from("sales_trial_invites")
    .select(
      "id,lead_name,lead_email,company_name,duration_minutes,max_cameras,expires_at,redeemed_at,revoked_at,created_at,trial_run_id,redeemed_organization_id,sales_operator_id",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (!access.isManager && access.operator) {
    inviteQuery = inviteQuery.eq("sales_operator_id", access.operator.id);
  }

  const { data: inviteData, error: inviteError } = await inviteQuery;

  if (inviteError) {
    throw new Error(`sales_trial_invites_unavailable:${inviteError.message}`);
  }

  const invites = (inviteData ?? []) as InviteRow[];
  const trialIds = invites
    .map((row) => row.trial_run_id)
    .filter((value): value is string => Boolean(value));
  const organizationIds = invites
    .map((row) => row.redeemed_organization_id)
    .filter((value): value is string => Boolean(value));

  const [trialsResult, paymentsResult, invoicesResult, operatorsResult] =
    await Promise.all([
      trialIds.length
        ? admin
            .from("trial_runs")
            .select(
              "id,status,capture_started_at,capture_completed_at,converted_at",
            )
            .in("id", trialIds)
        : Promise.resolve({ data: [], error: null }),
      organizationIds.length
        ? admin
            .from("billing_pix_payments")
            .select("organization_id,confirmed_at")
            .in("organization_id", organizationIds)
            .eq("status", "confirmed")
        : Promise.resolve({ data: [], error: null }),
      organizationIds.length
        ? admin
            .from("billing_invoices")
            .select("organization_id,paid_at")
            .in("organization_id", organizationIds)
            .eq("status", "paid")
        : Promise.resolve({ data: [], error: null }),
      access.isManager
        ? admin
            .from("sales_operators")
            .select("id,name,email,user_id,active,last_access_at,created_at")
            .order("active", { ascending: false })
            .order("name", { ascending: true })
        : Promise.resolve({
            data: access.operator
              ? [
                  {
                    id: access.operator.id,
                    name: access.operator.name,
                    email: access.operator.email,
                    user_id: access.operator.userId,
                    active: true,
                    last_access_at: null,
                    created_at: new Date().toISOString(),
                  },
                ]
              : [],
            error: null,
          }),
    ]);

  if (trialsResult.error) {
    throw new Error(`sales_trials_unavailable:${trialsResult.error.message}`);
  }
  if (paymentsResult.error) {
    throw new Error(`sales_payments_unavailable:${paymentsResult.error.message}`);
  }
  if (invoicesResult.error) {
    throw new Error(`sales_invoices_unavailable:${invoicesResult.error.message}`);
  }
  if (operatorsResult.error) {
    throw new Error(`sales_operators_unavailable:${operatorsResult.error.message}`);
  }

  const trials = (trialsResult.data ?? []) as TrialRow[];
  const operators = (operatorsResult.data ?? []) as OperatorRow[];
  const trialById = new Map(trials.map((row) => [row.id, row]));
  const operatorById = new Map(operators.map((row) => [row.id, row]));
  const paidOrganizations = new Set<string>();

  for (const row of paymentsResult.data ?? []) {
    if (row.organization_id) paidOrganizations.add(String(row.organization_id));
  }
  for (const row of invoicesResult.data ?? []) {
    if (row.organization_id) paidOrganizations.add(String(row.organization_id));
  }

  function converted(invite: InviteRow) {
    const trial = invite.trial_run_id
      ? trialById.get(invite.trial_run_id) ?? null
      : null;
    return Boolean(
      trial?.converted_at ||
        trial?.status === "converted" ||
        (invite.redeemed_organization_id &&
          paidOrganizations.has(invite.redeemed_organization_id)),
    );
  }

  const activatedCount = invites.filter((row) => Boolean(row.redeemed_at)).length;
  const startedCount = invites.filter((row) => {
    const trial = row.trial_run_id ? trialById.get(row.trial_run_id) ?? null : null;
    return Boolean(trial?.capture_started_at);
  }).length;
  const finishedCount = invites.filter((row) => {
    const trial = row.trial_run_id ? trialById.get(row.trial_run_id) ?? null : null;
    return isTrialFinished(trial);
  }).length;
  const convertedCount = invites.filter(converted).length;

  const operatorStats = new Map<
    string,
    { invites: number; activated: number; started: number; converted: number }
  >();

  for (const invite of invites) {
    if (!invite.sales_operator_id) continue;
    const current = operatorStats.get(invite.sales_operator_id) ?? {
      invites: 0,
      activated: 0,
      started: 0,
      converted: 0,
    };
    const trial = invite.trial_run_id
      ? trialById.get(invite.trial_run_id) ?? null
      : null;
    current.invites += 1;
    if (invite.redeemed_at) current.activated += 1;
    if (trial?.capture_started_at) current.started += 1;
    if (converted(invite)) current.converted += 1;
    operatorStats.set(invite.sales_operator_id, current);
  }

  const token = firstValue(query.token);
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "https://monitoria.cam").replace(
    /\/$/,
    "",
  );
  const shareUrl = token ? `${origin}/lead/${token}` : null;
  const activeOperators = operators.filter((row) => row.active);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          {access.isManager ? (
            <Link href="/dashboard/admin/customers">← Voltar para Clientes</Link>
          ) : null}
          <span>COMERCIAL · BIGCORPS</span>
          <h1>Trial comercial assistido</h1>
          <p>
            Gere demonstrações de 60 minutos, acompanhe cada lead e veja quando a
            venda for convertida.
          </p>
        </div>
        <div className={styles.operator}>
          <span>{access.isManager ? "Administrador" : "Vendedor"}</span>
          <strong>{access.operator?.name ?? access.user.email}</strong>
          {!access.isManager && access.operator ? (
            <small>{access.operator.email}</small>
          ) : null}
        </div>
      </header>

      <section className={styles.content}>
        {firstValue(query.message) ? (
          <div className={styles.success}>{firstValue(query.message)}</div>
        ) : null}
        {firstValue(query.error) ? (
          <div className={styles.error}>{firstValue(query.error)}</div>
        ) : null}

        {shareUrl ? (
          <div className={styles.shareCard}>
            <span>LINK GERADO · COPIE AGORA</span>
            <strong>{shareUrl}</strong>
            <p>
              Por segurança, apenas o código protegido fica salvo. Se perder este
              endereço, gere um novo convite.
            </p>
          </div>
        ) : null}

        <section className={styles.metrics} aria-label="Resumo comercial">
          <article>
            <span>CONVITES</span>
            <strong>{invites.length}</strong>
            <small>gerados</small>
          </article>
          <article>
            <span>ATIVADOS</span>
            <strong>{activatedCount}</strong>
            <small>contas que usaram o link</small>
          </article>
          <article>
            <span>TESTES INICIADOS</span>
            <strong>{startedCount}</strong>
            <small>relógio de 60 min iniciado</small>
          </article>
          <article>
            <span>TESTES CONCLUÍDOS</span>
            <strong>{finishedCount}</strong>
            <small>análise encerrada</small>
          </article>
          <article>
            <span>CONVERSÕES</span>
            <strong>{convertedCount}</strong>
            <small>{percentage(convertedCount, invites.length)} dos convites</small>
          </article>
        </section>

        {access.isManager ? (
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span>EQUIPE COMERCIAL</span>
                <h2>Operadores liberados</h2>
              </div>
              <Link className={styles.accessLink} href="/comercial" target="_blank">
                Abrir acesso dos vendedores ↗
              </Link>
            </div>

            <form action={addSalesOperatorAction} className={styles.operatorForm}>
              <label>
                <span>Nome do vendedor</span>
                <input name="operator_name" type="text" minLength={2} required />
              </label>
              <label>
                <span>E-mail</span>
                <input name="operator_email" type="email" required />
              </label>
              <button type="submit">Adicionar e liberar acesso</button>
            </form>
            <p className={styles.helper}>
              Depois de liberar o e-mail, envie <strong>monitoria.cam/comercial</strong>.
              O vendedor entra com Google ou solicita um link no próprio e-mail. Ele vê
              somente os próprios leads; você continua vendo toda a equipe.
            </p>

            <div className={styles.operatorList}>
              {operators.length ? (
                operators.map((operator) => {
                  const stats = operatorStats.get(operator.id) ?? {
                    invites: 0,
                    activated: 0,
                    started: 0,
                    converted: 0,
                  };
                  return (
                    <article className={styles.operatorRow} key={operator.id}>
                      <div className={styles.operatorIdentity}>
                        <strong>{operator.name}</strong>
                        <span>{operator.email}</span>
                        <small>
                          {operator.last_access_at
                            ? `Último acesso: ${formatDate(operator.last_access_at)}`
                            : "Ainda não acessou"}
                        </small>
                      </div>
                      <div className={styles.operatorNumbers}>
                        <span><strong>{stats.invites}</strong> convites</span>
                        <span><strong>{stats.started}</strong> testes</span>
                        <span><strong>{stats.converted}</strong> vendas</span>
                        <span><strong>{percentage(stats.converted, stats.invites)}</strong> conversão</span>
                      </div>
                      <span
                        className={
                          operator.active ? styles.activeBadge : styles.inactiveBadge
                        }
                      >
                        {operator.active ? "Ativo" : "Bloqueado"}
                      </span>
                      <div className={styles.operatorActions}>
                        <form action={setSalesOperatorActiveAction}>
                          <input type="hidden" name="operator_id" value={operator.id} />
                          <input
                            type="hidden"
                            name="active"
                            value={operator.active ? "false" : "true"}
                          />
                          <button
                            className={
                              operator.active
                                ? styles.revokeButton
                                : styles.secondaryButton
                            }
                            type="submit"
                          >
                            {operator.active ? "Bloquear" : "Reativar"}
                          </button>
                        </form>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className={styles.emptyState}>
                  <strong>Nenhum vendedor cadastrado</strong>
                  <p>Adicione o primeiro operador acima para testar o acesso comercial.</p>
                </div>
              )}
            </div>
          </section>
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
            {access.isManager ? (
              <label>
                <span>Responsável comercial</span>
                <select name="sales_operator_id" defaultValue="">
                  <option value="">Administrativo / sem vendedor</option>
                  {activeOperators.map((operator) => (
                    <option key={operator.id} value={operator.id}>
                      {operator.name} · {operator.email}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className={styles.assignedSeller}>
                <span>Responsável comercial</span>
                <strong>{access.operator?.name}</strong>
              </div>
            )}
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
              <span>FUNIL COMERCIAL</span>
              <h2>{access.isManager ? "Todos os convites" : "Meus convites"}</h2>
            </div>
            <strong>{invites.length} exibidos</strong>
          </div>

          <div className={styles.inviteList}>
            {invites.length ? (
              invites.map((invite) => {
                const trial = invite.trial_run_id
                  ? trialById.get(invite.trial_run_id) ?? null
                  : null;
                const isConverted = converted(invite);
                const stage = stageLabel(invite, trial, isConverted);
                const seller = invite.sales_operator_id
                  ? operatorById.get(invite.sales_operator_id) ?? null
                  : null;

                return (
                  <article className={styles.inviteRow} key={invite.id}>
                    <div className={styles.leadIdentity}>
                      <strong>{invite.company_name || invite.lead_name}</strong>
                      <span>{invite.lead_name} · {invite.lead_email}</span>
                      <small>
                        Criado em {formatDate(invite.created_at)}
                        {access.isManager
                          ? ` · Responsável: ${seller?.name ?? "Administrativo"}`
                          : ""}
                      </small>
                    </div>
                    <div className={styles.funnelStatus}>
                      <strong data-converted={isConverted}>{stage}</strong>
                      <span>{invite.max_cameras} câmera(s) · 60 min</span>
                      {trial?.capture_started_at ? (
                        <small>Iniciado: {formatDate(trial.capture_started_at)}</small>
                      ) : null}
                    </div>
                    <div className={styles.rowActions}>
                      {invite.trial_run_id ? (
                        <Link
                          className={styles.resultLink}
                          href={`/dashboard/admin/customers/trials/${invite.trial_run_id}/results`}
                        >
                          Ver resultado
                        </Link>
                      ) : null}
                      {!invite.redeemed_at && !invite.revoked_at ? (
                        <form action={revokeSalesTrialInviteAction}>
                          <input type="hidden" name="invite_id" value={invite.id} />
                          <button className={styles.revokeButton} type="submit">
                            Cancelar
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className={styles.emptyState}>
                <strong>Nenhum convite ainda</strong>
                <p>O primeiro lead criado aparecerá aqui com o andamento do trial.</p>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

import { createHash } from "node:crypto";
import Link from "next/link";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  acceptTeamInvitationAction,
  sendTeamInviteAccessLinkAction,
} from "./actions";
import styles from "./join.module.css";

export const metadata = { title: "Entrar na equipe" };
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  operator: "Operador",
  viewer: "Visualizador",
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

export default async function TeamJoinPage({ params, searchParams }: Props) {
  const { token } = await params;
  const query = await searchParams;
  const message = first(query.message);
  const errorMessage = first(query.error);
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("organization_invitations")
    .select("id,organization_id,email,role,expires_at,accepted_at,revoked_at,organization:organizations(name)")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  const organizationRelation = Array.isArray(invite?.organization)
    ? invite?.organization[0]
    : invite?.organization;
  const organizationName = String((organizationRelation as { name?: string } | null)?.name ?? "Equipe MonitorIA");
  const invalid =
    !invite ||
    Boolean(invite.accepted_at) ||
    Boolean(invite.revoked_at) ||
    Date.parse(String(invite.expires_at ?? "")) <= Date.now();

  const user = await getAuthenticatedUser();
  const sameEmail = Boolean(
    user?.email && invite?.email && user.email.toLowerCase() === String(invite.email).toLowerCase(),
  );

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link href="/" className={styles.brand}>
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>MonitorIA.cam</span>
        </Link>

        {invalid ? (
          <div className={styles.center}>
            <span className={styles.kicker}>CONVITE</span>
            <h1>Este convite não está mais disponível</h1>
            <p>Ele pode ter expirado, sido cancelado ou já ter sido aceito.</p>
            <Link className={styles.primaryLink} href="/login">Ir para o login</Link>
          </div>
        ) : (
          <>
            <span className={styles.kicker}>CONVITE DE EQUIPE</span>
            <h1>Entre em {organizationName}</h1>
            <p>
              Você foi convidado como <strong>{roleLabels[String(invite.role)] ?? String(invite.role)}</strong> usando o e-mail <strong>{String(invite.email)}</strong>.
            </p>

            {message ? <div className={styles.success}>{message}</div> : null}
            {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}

            {!user ? (
              <div className={styles.actions}>
                <form action={sendTeamInviteAccessLinkAction}>
                  <input type="hidden" name="token" value={token} />
                  <button type="submit">Enviar link de acesso para meu e-mail</button>
                </form>
                <Link href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}>
                  Já tenho acesso — entrar
                </Link>
                <small>
                  Se você ainda não tem conta, o link de e-mail cria seu acesso e volta para este convite.
                </small>
              </div>
            ) : sameEmail ? (
              <form action={acceptTeamInvitationAction} className={styles.actions}>
                <input type="hidden" name="token" value={token} />
                <button type="submit">Aceitar e entrar na equipe</button>
                <small>Você está conectado como {user.email}.</small>
              </form>
            ) : (
              <div className={styles.actions}>
                <div className={styles.error}>
                  Você está conectado como {user.email}. Este convite pertence a {String(invite.email)}.
                </div>
                <form action="/auth/signout" method="post">
                  <button type="submit">Sair e usar o e-mail convidado</button>
                </form>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

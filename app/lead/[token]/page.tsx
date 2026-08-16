import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getSalesTrialInvite } from "@/src/lib/sales-trial";
import {
  createLeadAccountAction,
  createLeadWorkspaceAction,
  loginLeadAccountAction,
  redeemSalesTrialInviteAction,
} from "./actions";
import styles from "./lead.module.css";

export const metadata = { title: "Demonstração MonitorIA" };
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

function durationLabel(minutes: number) {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hora" : `${hours} horas`;
  }
  return `${minutes} minutos`;
}

export default async function SalesLeadPage({ params, searchParams }: Props) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const invite = await getSalesTrialInvite(token);

  if (!invite) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <span className={styles.eyebrow}>CONVITE COMERCIAL</span>
          <h1>Este link não é válido.</h1>
          <p>Peça um novo convite à equipe MonitorIA.</p>
          <Link className={styles.secondaryButton} href="/">Voltar ao site</Link>
        </section>
      </main>
    );
  }

  const user = await getAuthenticatedUser();
  const organization = user ? await getCurrentOrganization(user.id) : null;

  if (
    invite.status === "redeemed" &&
    user &&
    organization &&
    invite.redeemedBy === user.id &&
    invite.redeemedOrganizationId === organization.id
  ) {
    redirect("/dashboard/trial/sales");
  }

  const message = firstValue(query.message);
  const error = firstValue(query.error);
  const unavailable = invite.status !== "active";

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <Link href="/" className={styles.brand}>Monitor<span>IA</span>.cam</Link>
        <span className={styles.eyebrow}>DEMONSTRAÇÃO ASSISTIDA</span>
        <h1>Veja a IA trabalhando nas câmeras do seu próprio negócio.</h1>
        <p>
          Este convite libera uma demonstração real de {durationLabel(invite.durationMinutes)}
          {" "}com até {invite.maxCameras} câmera(s), usando o modo Detalhada.
          O relógio só começa depois que as câmeras escolhidas estiverem prontas e você confirmar o início.
        </p>
        <div className={styles.facts}>
          <div><strong>{durationLabel(invite.durationMinutes)}</strong><span>de análise real</span></div>
          <div><strong>Até {invite.maxCameras}</strong><span>câmeras no mesmo teste</span></div>
          <div><strong>Sem cartão</strong><span>contratação somente depois</span></div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.inviteHeading}>
          <div>
            <span className={styles.eyebrow}>SEU CONVITE</span>
            <h2>{invite.companyName ?? invite.leadName ?? "Demonstração MonitorIA"}</h2>
          </div>
          <span className={unavailable ? styles.badgeOff : styles.badgeOn}>
            {invite.status === "active" ? "Disponível" : "Encerrado"}
          </span>
        </div>

        {message ? <div className={styles.success}>{message}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        {unavailable ? (
          <div className={styles.notice}>
            <strong>Este convite não pode mais ser ativado.</strong>
            <p>
              Ele pode ter expirado, sido cancelado ou já ter sido utilizado.
              Solicite um novo link à equipe MonitorIA.
            </p>
          </div>
        ) : !user ? (
          <div className={styles.authGrid}>
            <form action={loginLeadAccountAction} className={styles.form}>
              <input type="hidden" name="token" value={token} />
              <span className={styles.step}>JÁ TENHO CONTA</span>
              <h3>Entrar no MonitorIA</h3>
              <label>
                <span>E-mail</span>
                <input
                  name="email"
                  type="email"
                  defaultValue={invite.leadEmail ?? ""}
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                <span>Senha</span>
                <input name="password" type="password" minLength={8} autoComplete="current-password" required />
              </label>
              <button type="submit" className={styles.primaryButton}>Entrar e continuar</button>
            </form>

            <form action={createLeadAccountAction} className={styles.form}>
              <input type="hidden" name="token" value={token} />
              <span className={styles.step}>PRIMEIRO ACESSO</span>
              <h3>Criar conta pelo convite</h3>
              <label>
                <span>Seu nome</span>
                <input name="full_name" type="text" defaultValue={invite.leadName ?? ""} minLength={2} required />
              </label>
              <label>
                <span>E-mail</span>
                <input
                  name="email"
                  type="email"
                  defaultValue={invite.leadEmail ?? ""}
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                <span>Crie uma senha</span>
                <input name="password" type="password" minLength={8} autoComplete="new-password" required />
              </label>
              <button type="submit" className={styles.secondaryButton}>Criar conta e continuar</button>
            </form>
          </div>
        ) : !organization ? (
          <form action={createLeadWorkspaceAction} className={styles.form}>
            <input type="hidden" name="token" value={token} />
            <span className={styles.step}>PASSO 1 DE 2</span>
            <h3>Prepare sua empresa</h3>
            <p className={styles.helper}>
              O teste ainda não começa aqui. Primeiro vamos criar o local onde o Agent e as câmeras serão conectados.
            </p>
            <label>
              <span>Nome da empresa</span>
              <input name="organization_name" type="text" defaultValue={invite.companyName ?? ""} minLength={2} required />
            </label>
            <label>
              <span>Nome do primeiro local</span>
              <input name="site_name" type="text" placeholder="Ex.: Loja do centro" required />
            </label>
            <label>
              <span>Fuso horário</span>
              <select name="timezone" defaultValue="America/Sao_Paulo">
                <option value="America/Sao_Paulo">Brasília / São Paulo</option>
                <option value="America/Manaus">Manaus</option>
                <option value="America/Cuiaba">Cuiabá</option>
                <option value="America/Rio_Branco">Rio Branco</option>
                <option value="America/Noronha">Fernando de Noronha</option>
              </select>
            </label>
            <button type="submit" className={styles.primaryButton}>Salvar empresa e continuar</button>
          </form>
        ) : (
          <form action={redeemSalesTrialInviteAction} className={styles.activation}>
            <input type="hidden" name="token" value={token} />
            <span className={styles.step}>PASSO 2 DE 2</span>
            <h3>Ativar demonstração para {organization.name}</h3>
            <p>
              Ao ativar, você poderá escolher até {invite.maxCameras} câmeras. Os {durationLabel(invite.durationMinutes)}
              {" "}só começarão quando todas as câmeras selecionadas estiverem prontas e você clicar em iniciar.
            </p>
            <button type="submit" className={styles.primaryButton}>Ativar meu teste assistido</button>
          </form>
        )}
      </section>
    </main>
  );
}

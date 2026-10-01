import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import {
  BUSINESS_OPTIONS,
  DEFAULT_CAMERA_COUNT,
} from "@/src/lib/onboarding-intake";
import { getSalesTrialInvite } from "@/src/lib/sales-trial";
import {
  createLeadAccountAction,
  createLeadWorkspaceAction,
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
          <Link className={styles.secondaryButton} href="/">
            Voltar ao site
          </Link>
        </section>
      </main>
    );
  }

  const user = await getAuthenticatedUser();
  const organization = user ? await getCurrentOrganization(user.id) : null;
  const vip = Boolean(invite.vipProjectId);
  const continuationPath = vip ? "/vip/onboarding" : "/dashboard";

  if (
    invite.status === "redeemed" &&
    user &&
    organization &&
    invite.redeemedBy === user.id &&
    invite.redeemedOrganizationId === organization.id
  ) {
    redirect(continuationPath);
  }

  const message = firstValue(query.message);
  const error = firstValue(query.error);
  const unavailable = invite.status !== "active";

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <Link href="/" className={styles.brand}>
          Monitor<span>IA</span>.cam
          {vip ? <b className={styles.vipMark}>VIP</b> : null}
        </Link>
        <span className={styles.eyebrow}>
          {vip ? "IMPLANTAÇÃO VIP ASSISTIDA" : "DEMONSTRAÇÃO ASSISTIDA"}
        </span>
        <h1>
          {vip
            ? "Seu projeto MonitorIA VIP começa com uma implantação acompanhada."
            : "Veja a IA trabalhando nas câmeras do seu próprio negócio."}
        </h1>
        <p>
          Este convite libera uma demonstração real de{" "}
          {durationLabel(invite.durationMinutes)} com até {invite.maxCameras}{" "}
          câmera(s), usando o modo Detalhada. O relógio só começa quando as
          câmeras escolhidas estiverem prontas e você confirmar o início.
        </p>
        <div className={styles.facts}>
          <div>
            <strong>{durationLabel(invite.durationMinutes)}</strong>
            <span>de análise real</span>
          </div>
          <div>
            <strong>Até {invite.maxCameras}</strong>
            <span>câmeras no mesmo teste</span>
          </div>
          <div>
            <strong>Sem cartão</strong>
            <span>contratação somente depois</span>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.inviteHeading}>
          <div>
            <span className={styles.eyebrow}>SEU CONVITE</span>
            <h2>
              {invite.companyName ?? invite.leadName ?? "Demonstração MonitorIA"}
            </h2>
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
            <div className={styles.form}>
              <span className={styles.step}>JÁ TENHO CONTA</span>
              <h3>Entre com a mesma forma que já usava</h3>
              <p className={styles.helper}>
                Se você já entrou no MonitorIA alguma vez, não crie outra conta.
                Use Google, senha, passkey ou link por e-mail conforme o método
                que sua conta aceita.
              </p>
              <Link
                href={`/login?next=${encodeURIComponent(`/lead/${token}`)}`}
                className={styles.primaryButton}
              >
                Entrar e continuar este convite
              </Link>
              <p className={styles.helper}>
                Não lembra a senha? Na tela de login você pode usar “Esqueci
                minha senha” ou solicitar um link de acesso por e-mail.
              </p>
            </div>

            <form action={createLeadAccountAction} className={styles.form}>
              <input type="hidden" name="token" value={token} />
              <span className={styles.step}>PRIMEIRO ACESSO</span>
              <h3>Criar conta pelo convite</h3>
              <p className={styles.helper}>
                Use esta opção somente se este e-mail nunca teve uma conta
                MonitorIA.
              </p>
              <label>
                <span>Seu nome</span>
                <input
                  name="full_name"
                  type="text"
                  defaultValue={invite.leadName ?? ""}
                  minLength={2}
                  required
                />
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
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>
              <button type="submit" className={styles.secondaryButton}>
                Criar conta e continuar
              </button>
            </form>
          </div>
        ) : !organization ? (
          <form action={createLeadWorkspaceAction} className={styles.form}>
            <input type="hidden" name="token" value={token} />
            <span className={styles.step}>PASSO 1 DE 2</span>
            <h3>{vip ? "Prepare seu Projeto VIP" : "Prepare seu negócio"}</h3>
            <p className={styles.helper}>
              Vamos salvar os dados da empresa e do primeiro local. O teste
              ainda não começa aqui.
            </p>

            <label>
              <span>Nome da empresa</span>
              <input
                name="organization_name"
                type="text"
                defaultValue={invite.companyName ?? ""}
                minLength={2}
                maxLength={160}
                required
              />
            </label>

            <label>
              <span>Nome do primeiro local</span>
              <input
                name="site_name"
                type="text"
                placeholder="Ex.: Unidade São Paulo"
                maxLength={160}
                required
              />
            </label>

            <label>
              <span>Tipo de negócio</span>
              <select name="industry" defaultValue="Outro">
                {BUSINESS_OPTIONS.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Quantas câmeras existem neste local?</span>
              <input
                name="camera_count"
                type="number"
                min={1}
                max={100000}
                defaultValue={DEFAULT_CAMERA_COUNT}
                required
              />
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

            <p className={styles.helper}>
              A quantidade informada ajuda a preparar a implantação. No piloto
              você poderá escolher até {invite.maxCameras} câmera(s).
            </p>

            <button type="submit" className={styles.primaryButton}>
              Salvar empresa e continuar
            </button>
          </form>
        ) : (
          <form action={redeemSalesTrialInviteAction} className={styles.activation}>
            <input type="hidden" name="token" value={token} />
            <span className={styles.step}>PASSO 2 DE 2</span>
            <h3>
              {vip
                ? `Abrir implantação VIP de ${organization.name}`
                : `Ativar demonstração para ${organization.name}`}
            </h3>
            <p>
              {vip
                ? "Ao continuar, você entra no onboarding VIP acompanhado. A instalação, as câmeras, a calibração e o piloto ficam em uma sequência única, e o progresso permanece salvo até a contratação."
                : `Ao ativar, o painel continua pela configuração guiada. No último passo, o convite libera ${durationLabel(invite.durationMinutes)} de análise no modo Detalhada com até ${invite.maxCameras} câmera(s).`}
            </p>
            <button type="submit" className={styles.primaryButton}>
              {vip ? "Continuar implantação VIP" : "Ativar e começar a configuração"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

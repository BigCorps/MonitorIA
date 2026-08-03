import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getProfileData } from "@/src/lib/profile-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import {
  sendProfileMagicLink,
  updateOrganizationProfile,
  updatePersonalProfile,
  updateProfilePassword,
} from "./actions";
import { SecuritySettings } from "./security-settings";
import styles from "./profile.module.css";

export const metadata = {
  title: "Perfil e empresa",
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const roleLabels: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  operator: "Operador",
  viewer: "Visualizador",
};

function firstValue(
  value: string | string[] | undefined,
) {
  return typeof value === "string" ? value : null;
}

function accountDate(value: string | null) {
  if (!value) return "Não informada";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
  }).format(new Date(value));
}

export default async function ProfilePage({
  searchParams,
}: Props) {
  const user = await requireAuthenticatedUser();
  const profile = await getProfileData(user.id);

  if (!profile) {
    redirect("/onboarding");
  }

  const params = await searchParams;
  const message = firstValue(params.message);
  const error = firstValue(params.error);
  const canEditCompany =
    profile.organization.canEdit;

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={profile.organization.name}
        userEmail={profile.user.email}
        active="profile"
      />

      <section
        className={`dashboard-content ${styles.content}`}
      >
        <header className={styles.header}>
          <div>
            <span className="dashboard-eyebrow">
              CONTA E EMPRESA
            </span>
            <h1>Perfil</h1>
            <p>
              Atualize seus dados, as informações da
              empresa e a segurança da conta.
            </p>
          </div>

          <div className={styles.accountSummary}>
            <span>
              {roleLabels[profile.organization.role] ??
                profile.organization.role}
            </span>
            <strong>
              Plano {profile.organization.planCode}
            </strong>
          </div>
        </header>

        {message ? (
          <div
            className={`${styles.notice} ${styles.success}`}
          >
            {message}
          </div>
        ) : null}

        {error ? (
          <div
            className={`${styles.notice} ${styles.error}`}
          >
            {error}
          </div>
        ) : null}

        {!profile.company.tableReady ? (
          <div
            className={`${styles.notice} ${styles.warning}`}
          >
            A migration de perfil comercial ainda não
            foi aplicada no Supabase. Os dados pessoais
            continuam disponíveis.
          </div>
        ) : null}

        <div className={styles.grid}>
          <section className={styles.card}>
            <div className={styles.cardHeading}>
              <div>
                <span>DADOS PESSOAIS</span>
                <h2>Sua conta</h2>
              </div>
              <small>
                Criada em{" "}
                {accountDate(profile.user.createdAt)}
              </small>
            </div>

            <form
              action={updatePersonalProfile}
              className={styles.form}
            >
              <label className={styles.field}>
                <span>Nome completo</span>
                <input
                  name="full_name"
                  defaultValue={profile.user.fullName}
                  autoComplete="name"
                  maxLength={120}
                  required
                />
              </label>

              <label className={styles.field}>
                <span>E-mail</span>
                <input
                  value={profile.user.email}
                  readOnly
                  aria-readonly="true"
                  className={styles.readonly}
                />
                <small>
                  O e-mail é administrado pela
                  autenticação do Supabase.
                </small>
              </label>

              <div className={styles.twoColumns}>
                <label className={styles.field}>
                  <span>Telefone</span>
                  <input
                    name="phone"
                    defaultValue={profile.user.phone}
                    autoComplete="tel"
                    maxLength={40}
                    placeholder="(11) 99999-9999"
                  />
                </label>

                <label className={styles.field}>
                  <span>Função na empresa</span>
                  <input
                    name="job_title"
                    defaultValue={profile.user.jobTitle}
                    maxLength={100}
                    placeholder="Ex.: Proprietário"
                  />
                </label>
              </div>

              <div className={styles.formFooter}>
                <span>
                  Função de acesso:{" "}
                  <strong>
                    {roleLabels[
                      profile.organization.role
                    ] ?? profile.organization.role}
                  </strong>
                </span>
                <button type="submit">
                  Salvar dados pessoais
                </button>
              </div>
            </form>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeading}>
              <div>
                <span>SEGURANÇA</span>
                <h2>
                  {profile.user.hasPassword
                    ? "Alterar senha"
                    : "Criar senha"}
                </h2>
              </div>
              <small>
                {profile.user.hasPassword
                  ? "Confirme a senha atual."
                  : "Cadastre uma senha."}
              </small>
            </div>

            {!profile.user.passwordStatusReady ? (
              <div
                className={`${styles.notice} ${styles.warning}`}
              >
                A migration de controle de senha ainda
                não foi aplicada no Supabase.
              </div>
            ) : null}

            {!profile.user.hasPassword &&
            profile.user.passwordStatusReady ? (
              <div
                className={`${styles.notice} ${styles.success}`}
              >
                Crie uma senha.
              </div>
            ) : null}

            <form
              action={updateProfilePassword}
              className={styles.form}
            >
              <fieldset
                className={styles.fieldset}
                disabled={
                  !profile.user.passwordStatusReady
                }
              >
                {profile.user.hasPassword ? (
                  <label className={styles.field}>
                    <span>Senha atual</span>
                    <input
                      type="password"
                      name="current_password"
                      autoComplete="current-password"
                      required
                    />
                  </label>
                ) : null}

                <label className={styles.field}>
                  <span>
                    {profile.user.hasPassword
                      ? "Nova senha"
                      : "Criar senha"}
                  </span>
                  <input
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <small>
                    Use uma senha segura com pelo menos 8 dígitos.
                  </small>
                </label>

                <label className={styles.field}>
                  <span>Confirmar nova senha</span>
                  <input
                    type="password"
                    name="confirmation"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>

                <div className={styles.formFooter}>
                  <span>
                    {profile.user.hasPassword
                      ? "A alteração vale imediatamente."
                      : "O link mágico continuará funcionando normalmente."}
                  </span>
                  <button type="submit">
                    {profile.user.hasPassword
                      ? "Alterar senha"
                      : "Criar senha"}
                  </button>
                </div>
              </fieldset>
            </form>

            <div className={styles.securityDivider} />

            <div className={styles.magicLink}>
              <div>
                <strong>Link mágico</strong>
                <p>
                  Envie um novo link de acesso para{" "}
                  {profile.user.email}.
                </p>
              </div>
              <form action={sendProfileMagicLink}>
                <button
                  type="submit"
                  className={styles.secondaryButton}
                >
                  Enviar link
                </button>
              </form>
            </div>
          </section>

          <section
            className={`${styles.card} ${styles.fullWidth}`}
          >
            <div className={styles.cardHeading}>
              <div>
                <span>ACESSO E AUTENTICAÇÃO</span>
                <h2>Métodos de login e 2FA</h2>
              </div>
              <small>
                Passkeys, Google e verificação em duas
                etapas.
              </small>
            </div>

            <SecuritySettings
              userEmail={profile.user.email}
            />
          </section>

          <section
            className={`${styles.card} ${styles.companyCard}`}
          >
            <div className={styles.cardHeading}>
              <div>
                <span>EMPRESA E LOCAL</span>
                <h2>Dados comerciais</h2>
              </div>
              <small>
                {canEditCompany
                  ? "Você pode editar estas informações."
                  : "Somente proprietário ou administrador pode editar."}
              </small>
            </div>

            <form
              action={updateOrganizationProfile}
              className={styles.form}
            >
              <fieldset
                className={styles.fieldset}
                disabled={!canEditCompany}
              >
                <div className={styles.twoColumns}>
                  <label className={styles.field}>
                    <span>Nome da empresa</span>
                    <input
                      name="organization_name"
                      defaultValue={
                        profile.organization.name
                      }
                      maxLength={160}
                      required
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Razão social</span>
                    <input
                      name="legal_name"
                      defaultValue={
                        profile.company.legalName
                      }
                      maxLength={200}
                    />
                  </label>
                </div>

                <div className={styles.threeColumns}>
                  <label className={styles.field}>
                    <span>CNPJ</span>
                    <input
                      name="tax_id"
                      defaultValue={profile.company.taxId}
                      inputMode="numeric"
                      maxLength={18}
                      placeholder="00.000.000/0000-00"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Segmento</span>
                    <input
                      name="industry"
                      defaultValue={
                        profile.company.industry
                      }
                      maxLength={120}
                      placeholder="Ex.: Comércio varejista"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Telefone comercial</span>
                    <input
                      name="company_phone"
                      defaultValue={
                        profile.company.phone
                      }
                      autoComplete="tel"
                      maxLength={40}
                    />
                  </label>
                </div>

                <div className={styles.twoColumns}>
                  <label className={styles.field}>
                    <span>E-mail comercial</span>
                    <input
                      type="email"
                      name="contact_email"
                      defaultValue={
                        profile.company.contactEmail
                      }
                      autoComplete="email"
                      maxLength={254}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Site</span>
                    <input
                      name="website"
                      defaultValue={
                        profile.company.website
                      }
                      inputMode="url"
                      maxLength={500}
                      placeholder="https://suaempresa.com.br"
                    />
                  </label>
                </div>

                <div className={styles.sectionLabel}>
                  <span>ESTABELECIMENTO PRINCIPAL</span>
                </div>

                <div className={styles.twoColumns}>
                  <label className={styles.field}>
                    <span>Nome do local</span>
                    <input
                      name="site_name"
                      defaultValue={profile.site.name}
                      maxLength={160}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Fuso horário</span>
                    <select
                      name="timezone"
                      defaultValue={
                        profile.site.timezone
                      }
                    >
                      <option value="America/Sao_Paulo">
                        Brasília e São Paulo
                      </option>
                      <option value="America/Manaus">
                        Manaus
                      </option>
                      <option value="America/Cuiaba">
                        Cuiabá
                      </option>
                      <option value="America/Rio_Branco">
                        Rio Branco
                      </option>
                      <option value="America/Noronha">
                        Fernando de Noronha
                      </option>
                    </select>
                  </label>
                </div>

                <div className={styles.addressGrid}>
                  <label className={styles.field}>
                    <span>CEP</span>
                    <input
                      name="postal_code"
                      defaultValue={
                        profile.site.address.postalCode
                      }
                      autoComplete="postal-code"
                      maxLength={12}
                    />
                  </label>

                  <label
                    className={`${styles.field} ${styles.streetField}`}
                  >
                    <span>Endereço</span>
                    <input
                      name="street"
                      defaultValue={
                        profile.site.address.street
                      }
                      autoComplete="address-line1"
                      maxLength={180}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Número</span>
                    <input
                      name="number"
                      defaultValue={
                        profile.site.address.number
                      }
                      maxLength={30}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Complemento</span>
                    <input
                      name="complement"
                      defaultValue={
                        profile.site.address.complement
                      }
                      autoComplete="address-line2"
                      maxLength={100}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Bairro</span>
                    <input
                      name="neighborhood"
                      defaultValue={
                        profile.site.address
                          .neighborhood
                      }
                      maxLength={100}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Cidade</span>
                    <input
                      name="city"
                      defaultValue={
                        profile.site.address.city
                      }
                      autoComplete="address-level2"
                      maxLength={100}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>UF</span>
                    <input
                      name="state"
                      defaultValue={
                        profile.site.address.state
                      }
                      autoComplete="address-level1"
                      maxLength={2}
                    />
                  </label>
                </div>
              </fieldset>

              <div className={styles.formFooter}>
                <span>
                  Identificador interno:{" "}
                  <strong>
                    {profile.organization.slug}
                  </strong>
                </span>
                <button
                  type="submit"
                  disabled={!canEditCompany}
                >
                  Salvar dados da empresa
                </button>
              </div>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
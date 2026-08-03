import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import styles from "./oauth-consent.module.css";

export const metadata = {
  title: "Autorizar integração · MonitorIA",
};
export const dynamic = "force-dynamic";

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function clientIdFromDetails(details: any) {
  return String(
    details?.client?.id ??
      details?.client?.client_id ??
      details?.client_id ??
      "",
  );
}

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const authorizationId = scalar(params.authorization_id);

  if (!authorizationId) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>Solicitação inválida</h1>
          <p>O identificador de autorização não foi informado.</p>
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (!claims?.sub) {
    const next = `/oauth/consent?authorization_id=${encodeURIComponent(
      authorizationId,
    )}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const { data: details, error } =
    await supabase.auth.oauth.getAuthorizationDetails(
      authorizationId,
    );

  if (error || !details) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>Autorização indisponível</h1>
          <p>{error?.message ?? "A solicitação expirou ou é inválida."}</p>
        </section>
      </main>
    );
  }

  if (!("authorization_id" in details)) {
    redirect(details.redirect_url);
  }

  const clientId = clientIdFromDetails(details);
  const allowlist = new Set(
    (process.env.MCP_ALLOWED_OAUTH_CLIENT_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  if (allowlist.size && !allowlist.has(clientId)) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>Aplicativo não autorizado</h1>
          <p>Este cliente ainda não foi liberado para usar o MonitorIA.</p>
        </section>
      </main>
    );
  }

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role,organization:organizations(id,name,slug)")
    .eq("user_id", String(claims.sub))
    .order("created_at", { ascending: true });

  const organizations = (memberships ?? []).flatMap((membership: any) => {
    const relation = membership.organization;
    const organization = Array.isArray(relation) ? relation[0] : relation;
    return organization
      ? [
          {
            id: String(organization.id),
            name: String(organization.name),
            role: String(membership.role),
          },
        ]
      : [];
  });

  const scopes = String((details as any).scope ?? "")
    .split(" ")
    .filter(Boolean);
  const clientName = String(
    (details as any).client?.name ??
      (details as any).client_name ??
      "Aplicativo de IA",
  );

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.brand}>
          <img src="/favicon.svg" alt="" width={38} height={38} />
          <span>MonitorIA.cam</span>
        </div>

        <span className={styles.eyebrow}>AUTORIZAÇÃO SEGURA</span>
        <h1>Conectar {clientName}</h1>
        <p className={styles.lead}>
          O aplicativo poderá consultar os dados das organizações que você
          selecionar. Ele não poderá apagar eventos, alterar câmeras ou mudar
          configurações.
        </p>

        <form action="/api/oauth/decision" method="post">
          <input
            type="hidden"
            name="authorization_id"
            value={authorizationId}
          />

          <fieldset>
            <legend>Organizações autorizadas</legend>
            <div className={styles.organizations}>
              {organizations.map((organization: { id: string; name: string; role: string }) => (
                <label key={organization.id}>
                  <input
                    type="checkbox"
                    name="organization_ids"
                    value={organization.id}
                    defaultChecked
                  />
                  <span>
                    <strong>{organization.name}</strong>
                    <small>{organization.role}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={styles.permissions}>
            <strong>O aplicativo poderá:</strong>
            <ul>
              <li>listar locais e câmeras autorizadas;</li>
              <li>consultar eventos, estados e sessões operacionais;</li>
              <li>consultar resumos, comparações e insights;</li>
              <li>solicitar imagens temporárias quando necessário.</li>
            </ul>
            {scopes.length ? (
              <small>Escopos OAuth: {scopes.join(", ")}</small>
            ) : null}
          </div>

          <div className={styles.warning}>
            Pessoas e veículos são tratados como correspondências visuais
            prováveis. O MonitorIA não oferece reconhecimento facial por este
            conector.
          </div>

          <div className={styles.actions}>
            <button name="decision" value="deny" className={styles.deny}>
              Cancelar
            </button>
            <button
              name="decision"
              value="approve"
              className={styles.approve}
              disabled={!organizations.length}
            >
              Autorizar acesso
            </button>
          </div>
        </form>

        <footer>
          <a href="/integrations/monitoria-mcp/privacy">Privacidade</a>
          <a href="/integrations/monitoria-mcp/terms">Termos</a>
          <a href="/integrations/monitoria-mcp/support">Suporte</a>
        </footer>
      </section>
    </main>
  );
}

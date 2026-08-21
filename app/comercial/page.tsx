import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { getCommercialAccessForUser } from "@/src/lib/commercial-operator";
import { AuthButtons } from "@/app/login/auth-buttons";
import { sendCommercialMagicLinkAction } from "./actions";
import styles from "./commercial.module.css";

export const metadata = { title: "Área comercial | MonitorIA" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

export default async function CommercialEntryPage({ searchParams }: Props) {
  const user = await getAuthenticatedUser();

  if (user) {
    const access = await getCommercialAccessForUser(user);
    if (access) redirect("/dashboard/admin/customers/trials");
    redirect("/dashboard");
  }

  const query = await searchParams;
  const message = firstValue(query.message);
  const error = firstValue(query.error);

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link className={styles.brand} href="/">
          Monitor<span>IA</span>.cam
        </Link>
        <span className={styles.eyebrow}>ACESSO COMERCIAL</span>
        <h1>Entre na sua área de vendas.</h1>
        <p className={styles.intro}>
          Use o e-mail que foi liberado pela administração da BigCorps. Aqui você
          gera demonstrações, acompanha seus leads e vê as conversões.
        </p>

        {message ? <div className={styles.success}>{message}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        <AuthButtons next="/comercial" showPasskey={false} />

        <div className={styles.divider}><span>ou receba um link</span></div>

        <form action={sendCommercialMagicLinkAction} className={styles.form}>
          <label>
            <span>E-mail do vendedor</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="voce@empresa.com.br"
              required
            />
          </label>
          <button type="submit">Enviar link de acesso</button>
        </form>

        <div className={styles.footerLinks}>
          <Link href="/login?next=%2Fcomercial">Já tenho senha</Link>
          <Link href="/">Voltar ao site</Link>
        </div>
      </section>
    </main>
  );
}

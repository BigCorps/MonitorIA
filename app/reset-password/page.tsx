import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { updatePassword } from "./actions";

export const metadata = { title: "Nova senha" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="simple-auth-page">
      <section className="simple-auth-card">
        <span className="auth-kicker">NOVA SENHA</span>
        <h1>Escolha uma nova senha</h1>
        <p>Use pelo menos 8 caracteres.</p>
        {error ? <div className="form-alert error">{error}</div> : null}
        <form action={updatePassword} className="auth-form">
          <label><span>Nova senha</span><input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
          <label><span>Confirmar senha</span><input name="confirmation" type="password" minLength={8} autoComplete="new-password" required /></label>
          <button className="auth-submit" type="submit">Salvar nova senha</button>
        </form>
      </section>
    </main>
  );
}

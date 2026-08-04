import Link from "next/link";
import { requireInternalOperator } from "@/src/lib/internal-operator";
import styles from "./admin.module.css";

export const metadata = { title: "Painel Admin" };
export const dynamic = "force-dynamic";

const cards = [
  ["OPERAÇÃO", "Operações", "Acompanhamento diário, incidentes, câmeras e Agents.", "/dashboard/admin/operations"],
  ["INTELIGÊNCIA", "IA e custos", "Modelos, margem, projeções, alertas e testes de visão.", "/dashboard/admin/ai"],
  ["PLATAFORMA", "Infraestrutura", "Agent, armazenamento, saúde e serviços da plataforma.", "/dashboard/admin/infrastructure"],
  ["NEGÓCIO", "Clientes", "Apoio a organizações, trial, planos e cobranças.", "/dashboard/admin/customers"],
  ["GOVERNANÇA", "Auditoria", "MCP, revisões, acessos e rastreabilidade.", "/dashboard/admin/audit"],
] as const;

export default async function AdminPage() {
  const user = await requireInternalOperator();
  return (
    <main className={styles.page}>
      <header className={styles.topbar}><div><Link href="/dashboard">← Voltar ao dashboard</Link><span className={styles.eyebrow}>PAINEL ADMIN ★ · BIGCORPS</span><h1>Administração do MonitorIA</h1><p>As funções internas ficam separadas do dashboard dos clientes.</p></div><div className={styles.operator}><span>Operador interno autorizado</span><strong>{user.email}</strong></div></header>
      <section className={styles.grid}>{cards.map(([eyebrow,title,description,href]) => <Link className={styles.card} href={href} key={href}><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p><strong>Abrir seção →</strong></Link>)}</section>
    </main>
  );
}

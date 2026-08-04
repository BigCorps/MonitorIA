import Link from "next/link";
import styles from "./admin.module.css";

type Card = { eyebrow: string; title: string; description: string; href: string };

export function AdminSection({ operatorEmail, eyebrow, title, description, cards }: { operatorEmail: string | null; eyebrow: string; title: string; description: string; cards: Card[] }) {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div><Link href="/dashboard/admin">← Painel Admin</Link><span className={styles.eyebrow}>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
        <div className={styles.operator}><span>Operador interno autorizado</span><strong>{operatorEmail ?? "Conta autenticada"}</strong></div>
      </header>
      <section className={styles.section}>
        <div className={styles.sectionGrid}>{cards.map((card) => <Link className={styles.card} href={card.href} key={`${card.href}-${card.title}`}><span>{card.eyebrow}</span><h2>{card.title}</h2><p>{card.description}</p><strong>Abrir →</strong></Link>)}</div>
      </section>
    </main>
  );
}

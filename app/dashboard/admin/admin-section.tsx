import Link from "next/link";
import { AdminShell, type AdminSectionKey } from "./admin-shell";
import styles from "./admin.module.css";

type Card = {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
};

export function AdminSection({
  operatorEmail,
  active,
  eyebrow,
  title,
  description,
  cards,
}: {
  operatorEmail: string | null;
  active: AdminSectionKey;
  eyebrow: string;
  title: string;
  description: string;
  cards: Card[];
}) {
  return (
    <AdminShell
      admin={{ email: operatorEmail }}
      active={active}
      eyebrow={eyebrow}
      title={title}
      description={description}
    >
      <section className={styles.sectionGrid}>
        {cards.map((card) => (
          <Link
            className={styles.actionCard}
            href={card.href}
            key={`${card.href}-${card.title}`}
          >
            <span>{card.eyebrow}</span>
            <h2>{card.title}</h2>
            <p>{card.description}</p>
            <strong>Abrir →</strong>
          </Link>
        ))}
      </section>
    </AdminShell>
  );
}

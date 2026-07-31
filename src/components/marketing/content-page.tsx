import type { ReactNode } from "react";
import {
  MarketingCta,
  MarketingFooter,
  MarketingHeader,
} from "./site-chrome";
import styles from "./marketing.module.css";

type MarketingPageProps = {
  eyebrow: string;
  title: string;
  lead: string;
  children: ReactNode;
};

export function MarketingPage({ eyebrow, title, lead, children }: MarketingPageProps) {
  return (
    <main className={styles.page}>
      <MarketingHeader />
      <header className={styles.hero}>
        <div className={styles.container}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{lead}</p>
        </div>
      </header>
      <div className={`${styles.content} ${styles.container}`}>{children}</div>
      <MarketingCta />
      <MarketingFooter />
    </main>
  );
}

type ContentSectionProps = {
  label: string;
  title: string;
  children: ReactNode;
};

export function ContentSection({ label, title, children }: ContentSectionProps) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <span>{label}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className={styles.prose}>{children}</div>;
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}

export function InfoCard({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <article className={styles.card}>
      <span>{label}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

export function InfoList({ children }: { children: ReactNode }) {
  return <div className={styles.list}>{children}</div>;
}

export function InfoListItem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className={styles.listItem}>
      <strong>{title}</strong>
      <p>{children}</p>
    </article>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <div className={styles.note}>{children}</div>;
}

export { styles as marketingStyles };

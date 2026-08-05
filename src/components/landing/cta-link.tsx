import Link from "next/link";
import type { Cta } from "@/src/lib/landing-content";
import styles from "./landing.module.css";

/**
 * Renderiza um CTA vindo de `landing-content.ts`.
 *
 * O destino muda conforme a chave `trialIsLive`. Este componente só decide
 * entre <Link> e <a>, para que nenhuma seção precise saber disso.
 */
export function CtaLink({ cta, variant }: { cta: Cta; variant: "primary" | "ghost" }) {
  const className = `${styles.btn} ${variant === "primary" ? styles.btnPrimary : styles.btnGhost}`;

  if (cta.external) {
    return (
      <a className={className} href={cta.href} target="_blank" rel="noopener noreferrer">
        {cta.label}
      </a>
    );
  }

  return (
    <Link className={className} href={cta.href}>
      {cta.label}
    </Link>
  );
}

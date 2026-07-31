import Link from "next/link";
import { appConfig } from "@/src/lib/app-config";
import styles from "./marketing.module.css";

export function MarketingBrand() {
  return (
    <Link href="/" className={styles.brand} aria-label="MonitorIA.cam — página inicial">
      <span className={styles.brandMark} aria-hidden="true">
        <img src="/favicon.svg" alt="" width={25} height={25} />
      </span>
      <span>
        Monitor<strong>IA</strong>.cam
      </span>
    </Link>
  );
}

export function MarketingHeader() {
  return (
    <header className={`${styles.header} ${styles.container}`}>
      <MarketingBrand />
      <nav className={styles.nav} aria-label="Navegação institucional">
        <Link href="/como-funciona">Como funciona</Link>
        <Link href="/recursos">Recursos</Link>
        <Link href="/seguranca-e-privacidade">Segurança</Link>
        <Link href="/faq">Dúvidas</Link>
        <Link href="/dashboard" className={styles.panelLink}>Abrir painel</Link>
      </nav>
    </header>
  );
}

export function MarketingCta() {
  return (
    <section className={`${styles.cta} ${styles.container}`}>
      <div>
        <h2>Suas câmeras já gravam. Falta alguém lembrar.</h2>
        <p>
          Conte quantas câmeras você possui e quais situações precisa localizar ou acompanhar.
        </p>
      </div>
      <a
        className={styles.primaryLink}
        href={appConfig.whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Falar no WhatsApp
      </a>
    </section>
  );
}

export function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.footerTop}>
          <MarketingBrand />
          <nav className={styles.footerLinks} aria-label="Links do rodapé">
            <Link href="/sobre">Sobre</Link>
            <Link href="/contato">Contato</Link>
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/termos">Termos</Link>
          </nav>
        </div>
        <div className={styles.footerBottom}>
          <span>© 2026 {appConfig.company}. Todos os direitos reservados.</span>
          <span>{appConfig.slogan}</span>
        </div>
      </div>
    </footer>
  );
}

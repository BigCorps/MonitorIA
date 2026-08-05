import Link from "next/link";
import { appConfig } from "@/src/lib/app-config";
import { primaryCta, secondaryCta } from "@/src/lib/landing-content";
import { CtaLink } from "./cta-link";
import { MediaSlot } from "./media-slot";
import { SceneHero } from "./scenes";
import styles from "./landing.module.css";

export function Brand() {
  return (
    <Link href="/" className={styles.brand} aria-label={`${appConfig.name} — página inicial`}>
      <img src="/favicon.svg" alt="" width={27} height={27} />
      <span>
        Monitor<em>IA</em>.cam
      </span>
    </Link>
  );
}

export function LandingHeader() {
  return (
    <header className={`${styles.header} ${styles.container}`}>
      <Brand />
      <nav className={styles.nav} aria-label="Navegação principal">
        <Link href="#como-funciona">Como funciona</Link>
        <Link href="#planos">Planos</Link>
        <Link href="#duvidas">Dúvidas</Link>
      </nav>
      <div className={styles.headerCta}>
        <Link className={`${styles.btn} ${styles.btnGhost}`} href="/dashboard">
          Entrar
        </Link>
      </div>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className={`${styles.footer} ${styles.container}`}>
      <div className={styles.footerRow}>
        <Brand />
        <nav aria-label="Links do rodapé">
          <Link href="/como-funciona">Como funciona</Link>
          <Link href="/recursos">Recursos</Link>
          <Link href="/seguranca-e-privacidade">Segurança</Link>
          <Link href="/contato">Contato</Link>
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/termos">Termos</Link>
        </nav>
      </div>
      <div className={styles.footerRow}>
        <span>© 2026 {appConfig.company}. Todos os direitos reservados.</span>
        <span>{appConfig.slogan}</span>
      </div>
    </footer>
  );
}

export function Hero() {
  return (
    <section className={`${styles.hero} ${styles.container}`}>
      <div className={styles.heroGrid}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>08:12</span>
            <span>Loja aberta</span>
          </p>

          <h1 className={styles.h1}>
            <span className={styles.heroSlogan}>Sua câmera vê.</span>O MonitorIA lembra.
          </h1>

          <p className={styles.lede}>
            Pergunte o que aconteceu na sua loja e receba o horário exato. O vídeo continua
            no seu DVR — o MonitorIA guarda o registro escrito de cada acontecimento por 365
            dias e encontra o minuto certo em segundos.
          </p>

          <div className={styles.actions}>
            <CtaLink cta={primaryCta} variant="primary" />
            <CtaLink cta={secondaryCta} variant="ghost" />
          </div>

          <dl className={`${styles.proof} ${styles.stagger}`}>
            <div className={styles.proofItem}>
              <strong className={styles.mono}>R$ 39,90</strong>
              <span>por câmera, por mês. Sem mensalidade fixa.</span>
            </div>
            <div className={styles.proofItem}>
              <strong className={styles.mono}>365 dias</strong>
              <span>de histórico pesquisável em todos os planos.</span>
            </div>
            <div className={styles.proofItem}>
              <strong>Sem cartão</strong>
              <span>Pix, e nada renova sozinho.</span>
            </div>
            <div className={styles.proofItem}>
              <strong>Suas câmeras</strong>
              <span>Nenhum equipamento novo para comprar.</span>
            </div>
          </dl>
        </div>

        <MediaSlot label="Painel · Entrada principal">
          <SceneHero />
        </MediaSlot>
      </div>
    </section>
  );
}

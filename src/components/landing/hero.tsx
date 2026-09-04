import Link from "next/link";
import { appConfig } from "@/src/lib/app-config";
import { compatibility, primaryCta, type Cta } from "@/src/lib/landing-content";
import { CtaLink } from "./cta-link";
import { MediaSlot } from "./media-slot";
import { SceneHero } from "./scenes";
import styles from "./landing.module.css";
import playStoreStyles from "./play-store.module.css";

const accountCta: Cta = {
  label: "Acessar minha Conta",
  href: "/dashboard",
  external: false,
};

const playStoreUrl =
  "https://play.google.com/store/apps/details?id=cam.monitoria.twa";

const microsoftStoreUrl =
  "https://apps.microsoft.com/store/detail/XPDC2BLXQ99DTG";

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
        <Link href="#inteligencia">Inteligência</Link>
        <Link href="#planos">Planos</Link>
        <Link href="/recursos">Recursos</Link>
        <Link href="#duvidas">Dúvidas</Link>
      </nav>
      <div className={`${styles.headerCta} ${playStoreStyles.headerActions}`}>
        <a
          className={playStoreStyles.storeBadgeLink}
          href={playStoreUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Baixar o MonitorIA no Google Play"
        >
          <img
            className={playStoreStyles.storeBadge}
            src="/playstore-badge.png"
            alt="Disponível no Google Play"
            width={492}
            height={150}
          />
        </a>

        <a
          className={`${playStoreStyles.storeBadgeLink} ${playStoreStyles.microsoftStoreLink}`}
          href={microsoftStoreUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Baixar o MonitorIA na Microsoft Store"
        >
          <img
            className={playStoreStyles.storeBadge}
            src="/microsoft-store-badge.png"
            alt="Disponível na Microsoft Store"
            width={1760}
            height={538}
          />
        </a>

        <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/dashboard">
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
          <Link href="/retencao">Retenção</Link>
          <Link href="/subprocessadores">Subprocessadores</Link>
          <Link href="/termos">Termos</Link>
        </nav>
      </div>
      <div className={styles.footerRow}>
        <span>
          ©&nbsp;2026{" "}
          <a
            href="https://bigcorps.com.br"
            target="_blank"
            rel="noopener noreferrer"
          >
            {appConfig.company}
          </a>
          . Todos os direitos reservados.
        </span>
        <span>{appConfig.slogan}</span>
      </div>
    </footer>
  );
}

export function Hero() {
  return (
    <section className={`${styles.hero} ${styles.container}`}>
      <div className={`${styles.heroGrid} ${styles.recede}`}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>08:12</span>
            <span>Loja aberta</span>
          </p>

          <h1 className={styles.h1}>
            <span className={styles.heroSlogan}>{appConfig.sloganParts.first}</span>
            {appConfig.sloganParts.second}
          </h1>

          <p className={styles.lede}>
            Pergunte o que aconteceu e receba informações em tempo real, com gráficos e análises.
          </p>

          <p
            className={styles.trialNote}
            style={{
              marginTop: "18px",
              color: "var(--mint)",
              fontWeight: 650,
            }}
          >
            Configure sozinho em cerca de 10 minutos — sem técnico ou especialista.
          </p>

          <div className={styles.actions}>
            <CtaLink cta={primaryCta} variant="primary" />
            <CtaLink cta={accountCta} variant="ghost" />
          </div>

          <p className={styles.trialNote} style={{ marginTop: "14px" }}>
            {compatibility.short}
          </p>

          <dl className={`${styles.proof} ${styles.stagger}`}>
            <div className={styles.proofItem}>
              <strong className={styles.mono}>R$ 39,90</strong>
              <span>por câmera, por mês. Sem mensalidade fixa. *a partir</span>
            </div>
            <div className={styles.proofItem}>
              <strong className={styles.mono}>365 dias</strong>
              <span>de histórico pesquisável e análises em todos os planos.</span>
            </div>
            <div className={styles.proofItem}>
              <strong>Sem cartão</strong>
              <span>Pague facilmente com Pix e sem renovação automática.</span>
            </div>
            <div className={styles.proofItem}>
              <strong>Suas câmeras</strong>
              <span>DVR ou câmera de Aplicativo. Nenhum equipamento novo para comprar.</span>
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

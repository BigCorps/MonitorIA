import type { ReactNode } from "react";
import Link from "next/link";
import { vipConfig } from "@/src/vip/config";
import { vipHero, vipProof } from "@/src/lib/vip-landing-content";
import { SceneHero } from "@/src/components/landing/scenes";
import styles from "@/src/components/landing/landing.module.css";
import vip from "@/app/vip/landing/vip-landing.module.css";

export function VipBrand() {
  return (
    <Link
      href="/"
      className={`${styles.brand} ${vip.brand}`}
      aria-label="MonitorIA VIP — página inicial"
    >
      <img src="/vip-favicon.svg" alt="" width={27} height={27} />
      <span>
        Monitor<em>IA</em>.cam
      </span>
      <b className={vip.vipPill}>VIP</b>
    </Link>
  );
}

export function VipLandingHeader() {
  return (
    <header className={`${styles.header} ${styles.container}`}>
      <VipBrand />

      <nav className={styles.nav} aria-label="Navegação MonitorIA VIP">
        <Link href="#como-funciona">Como funciona</Link>
        <Link href="#inteligencia">Inteligência</Link>
        <Link href="#planos">Pacotes</Link>
        <Link href="#duvidas">Dúvidas</Link>
        <Link href="#contato">Falar com especialista</Link>
      </nav>

      <div className={styles.headerCta}>
        <a
          className={`${styles.btn} ${styles.btnGhost} ${vip.goldGhost}`}
          href="/vip/access"
          data-vip-event="client_login"
        >
          Já sou cliente VIP
        </a>
      </div>
    </header>
  );
}

function VipMedia({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={`${styles.media} ${vip.media} ${className}`}
    >
      <figcaption className={styles.mediaBar}>
        <span>
          <i className={`${styles.dot} ${vip.goldDot}`} aria-hidden="true" />
          <b>{label}</b>
        </span>
        <span className={styles.mono}>MonitorIA VIP</span>
      </figcaption>
      {children}
    </figure>
  );
}

export function VipHero() {
  return (
    <section className={`${styles.hero} ${styles.container}`}>
      <div className={`${styles.heroGrid} ${styles.recede}`}>
        <div className={styles.heroCopy}>
          <p className={`${styles.eyebrow} ${vip.eyebrow}`}>
            <span className={styles.eyebrowTime}>VIP</span>
            <span>{vipHero.kicker}</span>
          </p>

          <h1 className={styles.h1}>
            <span className={styles.heroSlogan}>{vipHero.titleFirst}</span>
            <strong className={vip.goldText}>{vipHero.titleSecond}</strong>
          </h1>

          <p className={styles.lede}>{vipHero.lede}</p>

          <p className={`${styles.trialNote} ${vip.heroNote}`}>
            {vipHero.note}
          </p>

          <div className={styles.actions}>
            <a
              className={`${styles.btn} ${vip.goldButton}`}
              href="#contato"
              data-vip-event="hero_contact"
            >
              Solicitar avaliação VIP
            </a>
            <a
              className={`${styles.btn} ${styles.btnGhost} ${vip.goldGhost}`}
              href="#como-funciona"
              data-vip-event="hero_how_it_works"
            >
              Ver como funciona
            </a>
          </div>

          <dl className={`${styles.proof} ${styles.stagger}`}>
            {vipProof.map((item) => (
              <div className={styles.proofItem} key={item.value}>
                <strong
                  className={
                    item.value.includes("10") || item.value.includes("Intensive")
                      ? `${styles.mono} ${vip.goldText}`
                      : vip.goldText
                  }
                >
                  {item.value}
                </strong>
                <span>{item.label}</span>
              </div>
            ))}
          </dl>
        </div>

        <VipMedia label="Painel executivo · Projeto VIP">
          <div className={vip.goldScene}>
            <SceneHero />
          </div>
        </VipMedia>
      </div>
    </section>
  );
}

export function VipLandingFooter() {
  return (
    <footer className={`${styles.footer} ${styles.container}`}>
      <div className={styles.footerRow}>
        <VipBrand />
        <nav aria-label="Links do rodapé">
          <a href="#como-funciona">Como funciona</a>
          <a href="#inteligencia">Inteligência</a>
          <a href="#planos">Pacotes</a>
          <a href="https://monitoria.cam/seguranca-e-privacidade">Segurança</a>
          <a href="https://monitoria.cam/contato">Contato</a>
          <a href="https://monitoria.cam/privacidade">Privacidade</a>
          <a href="https://monitoria.cam/termos">Termos</a>
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
            BigCorps
          </a>
          . Todos os direitos reservados.
        </span>
        <span>
          {vipConfig.productName} · inteligência para operações em escala.
        </span>
      </div>
    </footer>
  );
}

export { VipMedia };

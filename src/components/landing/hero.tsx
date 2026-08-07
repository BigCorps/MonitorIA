import Link from "next/link";
import { appConfig } from "@/src/lib/app-config";
import { compatibility, primaryCta, secondaryCta } from "@/src/lib/landing-content";
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
        <Link href="#inteligencia">Inteligência</Link>
        <Link href="#planos">Planos</Link>
        <Link href="/recursos">Recursos</Link>
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
        <span>
          ©&nbsp;2026{" "}
          
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

          {/* Lê de appConfig.sloganParts: o slogan não é mais escrito à mão
              aqui. A primeira metade fica em .heroSlogan (bloco próprio, tom
              mais apagado) e a segunda herda o branco do h1. */}
          <h1 className={styles.h1}>
            <span className={styles.heroSlogan}>{appConfig.sloganParts.first}</span>
            {appConfig.sloganParts.second}
          </h1>

          {/* Enxugado: uma promessa, uma prova. O detalhe do DVR desceu para
              a seção do problema — na primeira dobra ele só atrapalhava. */}
          <p className={styles.lede}>
            Pergunte o que aconteceu na sua loja e receba o horário exato. O registro de
            cada acontecimento fica guardado por um ano, pronto para consulta.
          </p>

          <div className={styles.actions}>
            <CtaLink cta={primaryCta} variant="primary" />
            <CtaLink cta={secondaryCta} variant="ghost" />
          </div>

          {/* Compatibilidade na primeira dobra: é a primeira objeção de quem
              chega. Reaproveita .trialNote — nenhuma classe nova. */}
          <p className={styles.trialNote}>{compatibility.short}</p>

          <dl className={`${styles.proof} ${styles.stagger}`}>
            <div className={styles.proofItem}>
              <strong className={styles.mono}>R$ 39,90</strong>
              <span>por câmera, por mês. Sem mensalidade fixa.</span>
            </div>
            <div className={styles.proofItem}>
              <strong className={styles.mono}>1 ano</strong>
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

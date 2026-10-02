import {
  vipProblems,
  vipSectors,
  vipUnderstands,
  vipValueSteps,
} from "@/src/lib/vip-landing-content";
import {
  VipSceneMultiSite,
  VipSceneScience,
  VipSceneSearch,
  VipSceneSecurity,
} from "./scenes";
import { VipMedia } from "./hero";
import {
  posterUrl,
  videoUrl,
  type SectorMediaId,
} from "@/src/components/landing/media-slot";
import styles from "@/src/components/landing/landing.module.css";
import vip from "@/app/vip/landing/vip-landing.module.css";

const stepScenes = {
  "multi-site": VipSceneMultiSite,
  search: VipSceneSearch,
  security: VipSceneSecurity,
  science: VipSceneScience,
} as const;

export function VipSectors() {
  return (
    <section
      className={`${styles.section} ${styles.sectionDeep} ${vip.vipSection}`}
    >
      <div className={styles.container}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={`${styles.eyebrow} ${vip.eyebrow}`}>
            <span className={styles.eyebrowTime}>—</span>
            <span>Onde o VIP faz diferença</span>
          </p>
          <h2 className={styles.h2}>
            Quando a quantidade de câmeras cresce, o valor está em enxergar
            melhor — não em assistir mais.
          </h2>
          <p className={styles.lede}>
            O MonitorIA VIP foi desenhado para quem precisa transformar volume
            de vídeo em contexto para decidir, investigar e acompanhar.
          </p>
        </div>

        <div className={styles.sectorStack}>
          {vipSectors.map((item) => {
            const id = item.media as SectorMediaId;
            const src = videoUrl(id);
            const poster = posterUrl(id);

            return (
              <article
                className={`${styles.sectorCard} ${vip.sectorCard}`}
                data-tone={item.tone}
                key={item.sector}
              >
                {src ? (
                  <video
                    className={styles.sectorMedia}
                    src={src}
                    poster={poster ?? undefined}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="none"
                    aria-hidden="true"
                  />
                ) : (
                  <div
                    className={`${styles.sectorArt} ${vip.sectorArt}`}
                    aria-hidden="true"
                  >
                    <span />
                    <span />
                    <span />
                  </div>
                )}

                <div
                  className={`${styles.sectorScrim} ${vip.sectorScrim}`}
                  aria-hidden="true"
                />

                <div className={styles.sectorTop}>
                  <p
                    className={`${styles.sectorValue} ${vip.sectorValue} ${vip.goldText}`}
                  >
                    {item.value}
                  </p>
                  <p className={styles.sectorLabel}>{item.label}</p>
                </div>

                <div className={styles.sectorBottom}>
                  <span
                    className={`${styles.sectorTag} ${vip.sectorTag}`}
                  >
                    {item.sector}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function VipProblem() {
  return (
    <section className={`${styles.section} ${vip.vipSection}`}>
      <div className={`${styles.container} ${styles.recede}`}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={`${styles.eyebrow} ${vip.eyebrow}`}>
            <span className={styles.eyebrowTime}>—</span>
            <span>O problema muda de escala</span>
          </p>
          <h2 className={styles.h2}>
            A câmera continua gravando. O desafio passa a ser encontrar,
            conectar e priorizar.
          </h2>
          <p className={styles.lede}>
            Em uma operação pequena, alguém ainda consegue abrir uma câmera e
            procurar. Em dezenas ou centenas, esse mesmo hábito vira custo,
            atraso e risco.
          </p>
        </div>

        <div className={`${styles.problemGrid} ${styles.stagger}`}>
          {vipProblems.map((item) => (
            <article
              className={`${styles.problemCard} ${vip.problemCard}`}
              key={item.title}
            >
              <h3 className={styles.h3}>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>

        <div className={`${styles.includes} ${styles.reveal} ${vip.includes}`}>
          <p className={styles.tableCaption}>O que muda com o VIP</p>

          <div className={vip.scaleGrid}>
            <div>
              <span>ORGANIZAÇÃO</span>
              <strong>Projeto → locais → câmeras</strong>
              <p>Escala sem perder o contexto de onde cada evidência veio.</p>
            </div>
            <div>
              <span>PESQUISA</span>
              <strong>Uma pergunta, várias fontes</strong>
              <p>O usuário parte da dúvida e chega aos horários relevantes.</p>
            </div>
            <div>
              <span>ATENÇÃO</span>
              <strong>Prioridade antes da revisão</strong>
              <p>A equipe entra no que pede decisão, não em uma fila de telas.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function VipHowItWorks() {
  return (
    <section
      className={`${styles.section} ${styles.sectionDeep} ${vip.vipSection}`}
      id="como-funciona"
    >
      <div className={`${styles.container} ${styles.recede}`}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={`${styles.eyebrow} ${vip.eyebrow}`}>
            <span className={styles.eyebrowTime}>—</span>
            <span>O que o cliente ganha</span>
          </p>
          <h2 className={styles.h2}>
            O mesmo vídeo. Muito menos trabalho para chegar à resposta.
          </h2>
          <p className={styles.lede}>
            O VIP não pede que sua equipe aprenda a “assistir melhor”. Ele
            organiza o que as câmeras viram para que pessoas trabalhem com a
            informação certa.
          </p>
        </div>

        <div className={styles.stepList}>
          {vipValueSteps.map((step, index) => {
            const Scene = stepScenes[step.scene as keyof typeof stepScenes];

            return (
              <article
                className={`${styles.step} ${
                  index % 2 === 1 ? styles.stepFlip : ""
                } ${styles.reveal}`}
                key={step.scene}
              >
                <div className={styles.stepCopy}>
                  <p className={`${styles.eyebrow} ${vip.eyebrow}`}>
                    <span className={styles.eyebrowTime}>{step.time}</span>
                    <span>{step.kicker}</span>
                  </p>
                  <h3 className={styles.h3}>{step.title}</h3>
                  <p>{step.text}</p>
                </div>

                <VipMedia
                  label={step.kicker}
                  className={styles.floatMedia}
                >
                  <Scene />
                </VipMedia>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function VipUnderstands() {
  return (
    <section
      className={`${styles.section} ${vip.vipSection}`}
      id="inteligencia"
    >
      <div className={`${styles.container} ${styles.recede}`}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={`${styles.eyebrow} ${vip.eyebrow}`}>
            <span className={styles.eyebrowTime}>—</span>
            <span>Inteligência</span>
          </p>
          <h2 className={styles.h2}>
            Não é só histórico. É contexto operacional pesquisável.
          </h2>
          <p className={styles.lede}>
            O MonitorIA VIP conecta o que aconteceu, onde aconteceu e em que
            condições a câmera estava — para responder perguntas que uma lista
            de gravações não responde.
          </p>
        </div>

        <div className={`${styles.problemGrid} ${styles.stagger}`}>
          {vipUnderstands.map((item) => (
            <article
              className={`${styles.problemCard} ${vip.problemCard}`}
              key={item.title}
            >
              <h3 className={styles.h3}>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

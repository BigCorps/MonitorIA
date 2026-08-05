import { boundaries, problems, sectors, steps } from "@/src/lib/landing-content";
import { MediaSlot, posterUrl, videoUrl, type SectorMediaId } from "./media-slot";
import {
  SceneAgentInstall,
  SceneCameraDiscovery,
  SceneEventCapture,
  SceneSearchAnswer,
} from "./scenes";
import styles from "./landing.module.css";

/** Cada etapa do "como funciona" tem sua própria cena SVG. */
const stepScenes = {
  "agent-install": SceneAgentInstall,
  "camera-discovery": SceneCameraDiscovery,
  "event-capture": SceneEventCapture,
  "search-answer": SceneSearchAnswer,
} as const;

function StepScene({ media }: { media: keyof typeof stepScenes }) {
  const Scene = stepScenes[media];
  return <Scene />;
}

export function Problem() {
  return (
    <section className={`${styles.section} ${styles.sectionDeep}`}>
      <div className={styles.container}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>—</span>
            <span>O problema</span>
          </p>
          <h2 className={styles.h2}>A câmera não é o problema. A memória é.</h2>
          <p className={styles.lede}>
            Você já tem as câmeras. Elas já gravam. O que falta é conseguir achar o momento
            certo antes que a gravação suma.
          </p>
        </div>

        <div className={`${styles.problemGrid} ${styles.stagger}`}>
          {problems.map((item) => (
            <article className={styles.problemCard} key={item.title}>
              <h3 className={styles.h3}>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section className={styles.section} id="como-funciona">
      <div className={styles.container}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>08:04</span>
            <span>Um dia de operação</span>
          </p>
          <h2 className={styles.h2}>Da instalação à primeira resposta.</h2>
          <p className={styles.lede}>
            Instalação por você mesmo, sem taxa e sem visita técnica. O suporte por WhatsApp
            existe para dúvida, não para depender dele.
          </p>
        </div>

        <div className={styles.stepList}>
          {steps.map((step, index) => (
            <article
              className={`${styles.step} ${index % 2 === 1 ? styles.stepFlip : ""} ${styles.reveal}`}
              key={step.media}
            >
              <div className={styles.stepCopy}>
                <p className={styles.eyebrow}>
                  <span className={styles.eyebrowTime}>{step.time}</span>
                  <span>{step.kicker}</span>
                </p>
                <h3 className={styles.h3}>{step.title}</h3>
                <p>{step.text}</p>
              </div>

              <MediaSlot label={step.kicker} className={styles.floatMedia}>
                <StepScene media={step.media} />
              </MediaSlot>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Sectors() {
  return (
    <section className={`${styles.section} ${styles.sectionDeep}`}>
      <div className={styles.container}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>—</span>
            <span>Onde funciona</span>
          </p>
          <h2 className={styles.h2}>Feito para quem já tem câmera e nunca teve tempo de assistir.</h2>
        </div>

        <div className={styles.sectorStack}>
          {sectors.map((item) => {
            const id = item.media as SectorMediaId;
            const src = videoUrl(id);
            const poster = posterUrl(id);

            return (
              <article className={styles.sectorCard} key={item.media}>
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
                  <div className={styles.sectorArt} aria-hidden="true" />
                )}
                <div className={styles.sectorScrim} aria-hidden="true" />

                <div className={styles.sectorTop}>
                  <p className={styles.sectorValue}>{item.value}</p>
                  <p className={styles.sectorLabel}>{item.label}</p>
                </div>
                <div className={styles.sectorBottom}>
                  <span className={styles.sectorTag}>{item.sector}</span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Boundaries() {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>—</span>
            <span>Limites declarados</span>
          </p>
          <h2 className={styles.h2}>O que o MonitorIA não faz.</h2>
          <p className={styles.lede}>
            É mais rápido entender o produto pelo que ele recusa. Nada aqui está em
            desenvolvimento: são decisões de projeto da versão 1.
          </p>
        </div>

        <div className={`${styles.boundaryGrid} ${styles.stagger}`}>
          {boundaries.map((item) => (
            <p className={styles.boundaryItem} key={item}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14" strokeLinecap="round" />
              </svg>
              {item}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Retention() {
  return (
    <section className={`${styles.section} ${styles.sectionDeep}`}>
      <div className={`${styles.container} ${styles.retention} ${styles.reveal}`}>
        <div>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>365</span>
            <span>dias</span>
          </p>
          <h2 className={styles.h2}>A gravação some. O registro fica.</h2>
          <p className={styles.lede}>
            O HD do DVR se sobrescreve sozinho e a gravação em nuvem é cara justamente porque
            guarda vídeo. O MonitorIA guarda o registro escrito e as imagens do acontecimento
            por um ano — em todos os planos, sem cobrar a mais por isso.
          </p>
        </div>

        <div>
          <div className={styles.scaleRow}>
            <div className={styles.scaleHead}>
              <strong>Gravação em nuvem comum</strong>
              <span className={styles.mono}>3 a 7 dias</span>
            </div>
            <div className={styles.scaleTrack}>
              <i style={{ width: "2%" }} />
            </div>
          </div>

          <div className={styles.scaleRow}>
            <div className={styles.scaleHead}>
              <strong>HD do seu DVR</strong>
              <span className={styles.mono}>15 a 30 dias</span>
            </div>
            <div className={styles.scaleTrack}>
              <i style={{ width: "8%" }} />
            </div>
          </div>

          <div className={styles.scaleRow}>
            <div className={styles.scaleHead}>
              <strong>Histórico no MonitorIA.cam</strong>
              <span className={styles.mono}>365 dias</span>
            </div>
            <div className={`${styles.scaleTrack} ${styles.scaleMine}`}>
              <i style={{ width: "100%" }} />
            </div>
          </div>

          <p className={styles.scaleNote}>
            O MonitorIA guarda horário, descrição, pessoas, veículos, objetos, zonas e as
            imagens do acontecimento. O vídeo contínuo permanece no seu equipamento.
          </p>
        </div>
      </div>
    </section>
  );
}

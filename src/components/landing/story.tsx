import {
  problems,
  retentionNote,
  retentionScales,
  sectors,
  steps,
  understands,
} from "@/src/lib/landing-content";
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

/**
 * O problema.
 *
 * Absorveu a antiga seção <Retention />. Os dois blocos defendiam a mesma
 * ideia — "a gravação desaparece antes de você precisar dela" — em duas
 * seções separadas. Agora a dor vem nos três cartões e a prova vem logo
 * abaixo, na régua de tempo de retenção. Uma seção a menos, argumento
 * inteiro no mesmo lugar.
 */
export function Problem() {
  return (
    <section className={`${styles.section} ${styles.sectionDeep}`}>
      <div className={`${styles.container} ${styles.recede}`}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>—</span>
            <span>O problema</span>
          </p>
          <h2 className={styles.h2}>A câmera não é o problema. A memória é.</h2>
          <p className={styles.lede}>
            Você já tem as câmeras e elas já gravam. O que falta é achar o momento certo
            antes que a gravação desapareça.
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

        {/* Prova do argumento acima. Reaproveita .includes como moldura e as
            classes de régua (.scaleRow / .scaleTrack / .scaleMine) que já
            existiam na seção de retenção. Nenhuma classe nova. */}
        <div className={`${styles.includes} ${styles.reveal}`}>
          <p className={styles.tableCaption}>Quanto tempo cada coisa sobrevive</p>

          {retentionScales.map((scale) => (
            <div className={styles.scaleRow} key={scale.label}>
              <div className={styles.scaleHead}>
                <strong>{scale.label}</strong>
                <span className={styles.mono}>{scale.span}</span>
              </div>
              <div
                className={`${styles.scaleTrack} ${scale.mine ? styles.scaleMine : ""}`}
              >
                <i style={{ width: scale.width }} />
              </div>
            </div>
          ))}

          <p className={styles.scaleNote}>{retentionNote}</p>
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section className={styles.section} id="como-funciona">
      <div className={`${styles.container} ${styles.recede}`}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>08:04</span>
            <span>Um dia de operação</span>
          </p>
          <h2 className={styles.h2}>Da instalação à primeira resposta.</h2>
          <p className={styles.lede}>
            Você instala sozinho, sem taxa e sem visita técnica. O suporte no WhatsApp
            existe para dúvida, não para você depender dele.
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

/**
 * O que ele entende sozinho.
 *
 * Seção nova. Cobre os módulos que já existiam no código e não apareciam
 * na página: sessões operacionais, rotina aprendida, saúde da câmera,
 * estado visual, perfil de equipe e continuidade.
 *
 * São 6 itens de propósito: fecham a grade 3×2 do .problemGrid e casam com
 * os seis passos declarados em .stagger no CSS. Um sétimo item entraria sem
 * animação de cascata.
 */
export function Understands() {
  return (
    <section className={styles.section} id="inteligencia">
      <div className={`${styles.container} ${styles.recede}`}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>—</span>
            <span>Inteligência</span>
          </p>
          <h2 className={styles.h2}>Ele não só guarda. Ele entende.</h2>
          <p className={styles.lede}>
            Cada imagem vira informação organizada. O MonitorIA junta os acontecimentos
            soltos, aprende a rotina da sua operação e avisa quando algo sai do normal.
          </p>
        </div>

        <div className={`${styles.problemGrid} ${styles.stagger}`}>
          {understands.map((item) => (
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

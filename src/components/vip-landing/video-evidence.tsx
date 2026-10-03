import {
  MONITORIA_CLIP_MAX_DURATION_SECONDS,
  MONITORIA_CLIP_RETENTION_DAYS,
  expectedLongTermEvidenceCount,
} from "@/src/clips/policy";
import styles from "@/src/components/landing/landing.module.css";
import vip from "@/app/vip/landing/vip-landing.module.css";
import local from "./video-evidence.module.css";

function durationLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

export function VipVideoEvidence() {
  const images = expectedLongTermEvidenceCount("intensive");

  return (
    <section
      className={`${styles.section} ${styles.sectionDeep} ${vip.vipSection}`}
      id="evidencias"
    >
      <div className={`${styles.container} ${styles.recede}`}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={`${styles.eyebrow} ${vip.eyebrow}`}>
            <span className={styles.eyebrowTime}>▶</span>
            <span>Evidência que você pode rever</span>
          </p>
          <h2 className={styles.h2}>
            No VIP, o acontecimento não termina em uma descrição.
          </h2>
          <p className={styles.lede}>
            Todas as câmeras VIP trabalham em modo Intensive. Além do registro
            pesquisável, o MonitorIA preserva as imagens principais e, quando o
            vídeo do acontecimento está disponível, guarda também o trecho para
            você assistir ou baixar depois.
          </p>
        </div>

        <div className={`${styles.trialFacts} ${styles.stagger}`}>
          <div className={`${styles.trialFact} ${vip.trialFact}`}>
            <b className={`${styles.mono} ${vip.goldText}`}>{images}</b>
            <span>imagens principais de longo prazo</span>
          </div>
          <div className={`${styles.trialFact} ${vip.trialFact}`}>
            <b className={`${styles.mono} ${vip.goldText}`}>
              até {durationLabel(MONITORIA_CLIP_MAX_DURATION_SECONDS)}
            </b>
            <span>de vídeo do acontecimento</span>
          </div>
          <div className={`${styles.trialFact} ${vip.trialFact}`}>
            <b className={`${styles.mono} ${vip.goldText}`}>
              {MONITORIA_CLIP_RETENTION_DAYS} dias
            </b>
            <span>de retenção do vídeo preservado</span>
          </div>
          <div className={`${styles.trialFact} ${vip.trialFact}`}>
            <b className={`${styles.mono} ${vip.goldText}`}>1 ano</b>
            <span>de histórico pesquisável do acontecimento</span>
          </div>
        </div>

        <div className={`${styles.includes} ${styles.reveal} ${vip.includes} ${local.explainer}`}>
          <div>
            <span>O QUE FICA NO LOCAL</span>
            <strong>A gravação contínua continua no seu DVR, NVR ou equipamento.</strong>
            <p>O MonitorIA não tenta virar outro DVR na nuvem.</p>
          </div>
          <div>
            <span>O QUE O VIP PRESERVA</span>
            <strong>O trecho que prova o acontecimento relevante.</strong>
            <p>O clipe acompanha o acontecimento, com margem antes do início, dentro do teto atual do produto.</p>
          </div>
          <div>
            <span>NO DASHBOARD</span>
            <strong>Assistir e baixar quando o vídeo estiver disponível.</strong>
            <p>O detalhe do acontecimento reúne imagens, horário, contexto e o vídeo preservado em um só lugar.</p>
          </div>
        </div>

        <p className={styles.scaleNote}>
          Os vídeos preservados são evidências de acontecimentos e ficam sem áudio.
          Não representam armazenamento contínuo de todas as câmeras na nuvem.
        </p>
      </div>
    </section>
  );
}

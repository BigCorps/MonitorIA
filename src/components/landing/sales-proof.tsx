"use client";

import { useMemo, useState } from "react";
import { calculateVideoVolume } from "@/src/landing/video-volume";
import styles from "./landing.module.css";
import sales from "./sales-proof.module.css";

type Experience = "standard" | "vip";

type Copy = {
  eyebrow: string;
  title: string;
  lede: string;
  camerasLabel: string;
  ctaLabel: string;
  ctaHref: string;
  resultTitle: string;
  resultText: string;
  beforeTitle: string;
  afterTitle: string;
  before: readonly string[];
  after: readonly string[];
};

const COPY: Record<Experience, Copy> = {
  standard: {
    eyebrow: "Faça a conta com as suas câmeras",
    title: "Quantas horas de vídeo existem antes de você precisar encontrar um único minuto?",
    lede:
      "Informe quantas câmeras você usa e por quantas horas elas gravam. A conta abaixo não promete economia: mostra apenas o volume de vídeo que sua operação produz.",
    camerasLabel: "Quantas câmeras você tem?",
    ctaLabel: "Testar nas minhas câmeras",
    ctaHref: "/login?criar=1",
    resultTitle: "Você não precisa assistir a tudo.",
    resultText: "Precisa encontrar o momento que importa quando a pergunta aparece.",
    beforeTitle: "Só câmera + DVR",
    afterTitle: "Com o MonitorIA",
    before: [
      "A câmera grava horas continuamente.",
      "Quando algo acontece, alguém precisa estimar o dia e procurar o trecho.",
      "O histórico do equipamento pode ser sobrescrito antes de você lembrar de procurar.",
      "Uma câmera pode estar ligada e ainda entregar imagem ruim, congelada ou fora do lugar.",
    ],
    after: [
      "Acontecimentos ganham horário, descrição e evidências pesquisáveis.",
      "Você pesquisa por texto ou pergunta com as suas palavras.",
      "O histórico pesquisável fica disponível por 1 ano nos planos atuais.",
      "A saúde visual da câmera entra no acompanhamento da operação.",
    ],
  },
  vip: {
    eyebrow: "Escala em números",
    title: "Quando as câmeras se multiplicam, assistir mais deixa de ser uma estratégia.",
    lede:
      "Coloque o tamanho real da sua operação. O cálculo é somente câmera × horas informadas por você e ajuda a visualizar por que dezenas ou centenas de fontes precisam virar informação pesquisável.",
    camerasLabel: "Quantas câmeras existem na operação?",
    ctaLabel: "Provar na minha operação",
    ctaHref: "#contato",
    resultTitle: "Escala não se resolve com mais telas.",
    resultText: "A equipe precisa partir da dúvida e chegar às fontes e horários relevantes.",
    beforeTitle: "Operação tradicional em escala",
    afterTitle: "Com MonitorIA VIP",
    before: [
      "Mais câmeras significam mais fontes para abrir e revisar manualmente.",
      "Um mesmo acontecimento pode atravessar vários ambientes e virar fragmentos separados.",
      "Problemas de imagem podem ser percebidos apenas quando alguém precisa da gravação.",
      "A equipe começa pela câmera e tenta descobrir onde está a resposta.",
    ],
    after: [
      "Projeto, locais e câmeras ficam organizados na mesma estrutura operacional.",
      "A Pesquisa IA parte da pergunta e cruza o contexto disponível do Projeto.",
      "Continuidade entre câmeras é tratada como correspondência provável, sem biometria.",
      "Saúde, rotinas, processos e evidências podem entrar na mesma investigação.",
    ],
  },
};

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits,
  }).format(value);
}

export function SalesProof({ experience }: { experience: Experience }) {
  const copy = COPY[experience];
  const minimumCameras = experience === "vip" ? 10 : 1;
  const [cameraCountInput, setCameraCountInput] = useState(
    experience === "vip" ? "50" : "8",
  );
  const [hoursPerDayInput, setHoursPerDayInput] = useState("24");

  const cameraCount = Math.max(
    minimumCameras,
    Math.min(100000, Number(cameraCountInput) || minimumCameras),
  );
  const hoursPerDay = Math.max(1, Math.min(24, Number(hoursPerDayInput) || 1));

  const volume = useMemo(
    () => calculateVideoVolume(cameraCount, hoursPerDay),
    [cameraCount, hoursPerDay],
  );

  return (
    <section
      className={`${styles.section} ${experience === "vip" ? styles.sectionDeep : ""}`}
      id={experience === "vip" ? "escala" : "volume"}
    >
      <div className={`${styles.container} ${styles.recede}`}>
        <div className={`${styles.sectionHead} ${styles.wipe}`}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowTime}>—</span>
            <span>{copy.eyebrow}</span>
          </p>
          <h2 className={styles.h2}>{copy.title}</h2>
          <p className={styles.lede}>{copy.lede}</p>
        </div>

        <div className={`${sales.calculator} ${styles.reveal}`} data-experience={experience}>
          <div className={sales.controls}>
            <label className={sales.field}>
              <span>{copy.camerasLabel}</span>
              <div className={sales.inputRow}>
                <input
                  aria-label={copy.camerasLabel}
                  type="number"
                  inputMode="numeric"
                  min={minimumCameras}
                  max={100000}
                  value={cameraCountInput}
                  onChange={(event) =>
                    setCameraCountInput(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  onBlur={() => setCameraCountInput(String(cameraCount))}
                />
                <b>câmeras</b>
              </div>
            </label>

            <label className={sales.field}>
              <span>Quantas horas por dia elas gravam?</span>
              <div className={sales.inputRow}>
                <input
                  aria-label="Horas gravadas por dia"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={24}
                  value={hoursPerDayInput}
                  onChange={(event) =>
                    setHoursPerDayInput(event.target.value.replace(/\D/g, "").slice(0, 2))
                  }
                  onBlur={() => setHoursPerDayInput(String(hoursPerDay))}
                />
                <b>h / dia</b>
              </div>
            </label>

            <p className={sales.mathNote}>
              Conta transparente: {formatNumber(volume.cameraCount)} câmera(s) × {formatNumber(volume.hoursPerDay)} h/dia. Nenhuma estimativa de economia ou produtividade é aplicada.
            </p>
          </div>

          <div className={sales.results} aria-live="polite">
            <div className={sales.resultCard}>
              <span>Vídeo produzido por dia</span>
              <strong className={styles.mono}>{formatNumber(volume.dailyHours)} h</strong>
            </div>
            <div className={sales.resultCard}>
              <span>Em 30 dias</span>
              <strong className={styles.mono}>{formatNumber(volume.monthlyHours)} h</strong>
            </div>
            <div className={`${sales.resultCard} ${sales.resultAccent}`}>
              <span>Para assistir só 1 dia inteiro</span>
              <strong className={styles.mono}>
                {formatNumber(volume.workdaysForOneDay, 1)} jornadas
              </strong>
              <small>de 8 horas, uma após a outra</small>
            </div>
          </div>

          <div className={sales.resultMessage}>
            <strong>{copy.resultTitle}</strong>
            <span>{copy.resultText}</span>
          </div>
        </div>

        <div className={`${sales.comparison} ${styles.reveal}`}>
          <article className={sales.beforeCard}>
            <p className={sales.cardKicker}>ANTES</p>
            <h3 className={styles.h3}>{copy.beforeTitle}</h3>
            <ul>
              {copy.before.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className={sales.afterCard}>
            <p className={sales.cardKicker}>DEPOIS</p>
            <h3 className={styles.h3}>{copy.afterTitle}</h3>
            <ul>
              {copy.after.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <a className={sales.cta} href={copy.ctaHref}>
              {copy.ctaLabel}
            </a>
          </article>
        </div>
      </div>
    </section>
  );
}

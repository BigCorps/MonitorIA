import type { AnalysisPlanCode } from "@/src/lib/analysis-plans";

/**
 * Política de clipes de evidência do MonitorIA 1.0.2.
 *
 * O vídeo é uma prova visual do acontecimento, não uma gravação forense nem
 * um DVR em nuvem. A fonte preferida é o substream H.264 leve. Quando o
 * stream já está dentro do envelope de até 720p e aproximadamente 900 kbps,
 * o Agent faz remux/passthrough (`-c:v copy`), sem recomprimir. Streams mais
 * pesados são transcodificados na FILA DE VÍDEO, nunca na fila de eventos,
 * para H.264/OpenH264 com alvo de aproximadamente 600 kbps, 12 fps e sem
 * áudio. Assim uma câmera mal configurada não multiplica silenciosamente o
 * consumo de Storage.
 *
 * O FFmpeg oficial distribuído pelo MonitorIA permanece LGPL e inclui
 * libopenh264; a política não depende de libx264/libx265 GPL.
 */

/** Fallback quando não há configuração por câmera. */
export const MONITORIA_CLIP_DURATION_SECONDS = 15;

/**
 * Teto de duração solicitado ao Agent.
 *
 * A timeline 1.0.2 mantém ring local de 15 minutos e fixa imediatamente os
 * segmentos de um acontecimento assim que ele entra na fila durável. O teto
 * de 310 s é, portanto, uma política de produto/custo — não um limite do ring.
 */
export const MONITORIA_CLIP_MAX_DURATION_SECONDS = 310;

/** Margem antes do início do evento, para a prova não começar cortada. */
export const MONITORIA_CLIP_PRE_ROLL_SECONDS = 3;

/** Margem depois do fim, pelo mesmo motivo. */
export const MONITORIA_CLIP_POST_ROLL_SECONDS = 2;

export const MONITORIA_CLIP_RETENTION_DAYS = 30;

/**
 * Teto de segurança, não tamanho-alvo.
 *
 * A evidência normalmente é muito menor. Se o passthrough exceder o envelope
 * leve, a 1.0.2 recodifica antes do upload; 100 MB existe apenas para impedir
 * upload aberrante/corrompido.
 */
export const MONITORIA_CLIP_MAX_BYTES = 100 * 1024 * 1024;

export function expectedLongTermEvidenceCount(
  planCode: string | null | undefined,
) {
  if (planCode === "intensive") return 3;
  if (planCode === "standard") return 2;
  return 1;
}

export function planSupportsClips(
  planCode: string | null | undefined,
): planCode is AnalysisPlanCode {
  return planCode === "intensive";
}

/**
 * Duração do clipe para um acontecimento.
 *
 * Cobre do pré-roll ao pós-roll, limitado pelo teto da política e pelo limite
 * comercial do entitlement. Nunca devolve menos que o fallback, para um
 * evento muito curto não gerar uma prova visual inútil.
 */
export function clipDurationForEvent(input: {
  startedAt: string | Date;
  endedAt: string | Date | null | undefined;
  maxAllowedSeconds?: number | null;
}): number {
  const start = new Date(input.startedAt).getTime();
  const end = input.endedAt ? new Date(input.endedAt).getTime() : Number.NaN;

  const eventSeconds =
    Number.isFinite(start) && Number.isFinite(end) && end > start
      ? (end - start) / 1000
      : MONITORIA_CLIP_DURATION_SECONDS;

  const desired =
    MONITORIA_CLIP_PRE_ROLL_SECONDS +
    eventSeconds +
    MONITORIA_CLIP_POST_ROLL_SECONDS;

  const configuredCeiling =
    typeof input.maxAllowedSeconds === "number" &&
    Number.isFinite(input.maxAllowedSeconds) &&
    input.maxAllowedSeconds > 0
      ? input.maxAllowedSeconds
      : MONITORIA_CLIP_MAX_DURATION_SECONDS;

  const ceiling = Math.min(
    configuredCeiling,
    MONITORIA_CLIP_MAX_DURATION_SECONDS,
  );

  return Math.max(
    MONITORIA_CLIP_DURATION_SECONDS,
    Math.min(ceiling, Math.ceil(desired)),
  );
}

/** Texto para a interface, sem jargão. */
export function clipDescription(planCode: string | null | undefined): string {
  if (!planSupportsClips(planCode)) return "Sem vídeo";
  return `Vídeo do acontecimento, até ${MONITORIA_CLIP_MAX_DURATION_SECONDS} segundos`;
}

import type { AnalysisPlanCode } from "@/src/lib/analysis-plans";

/**
 * Política de clipes de evidência.
 *
 * ------------------------------------------------------------------------
 * Mudança da 0.11.0: o clipe passa a cobrir o acontecimento inteiro, e não
 * mais 15 segundos fixos.
 *
 * Três medições sustentaram a decisão (1.288 acontecimentos, 7 dias):
 *
 *   duração média .......... 35,9s
 *   mediana ................ 24,0s
 *   p90 .................... 76,3s
 *   p99 ................... 180,3s
 *   maior ................. 243,5s
 *   acima de 2 min ......... 34 eventos (2,6%)
 *
 * E o custo de armazenamento, com retenção de 30 dias, para todas as
 * câmeras somadas:
 *
 *   15s fixos (antes) ...... R$ 0,71/mês
 *   evento inteiro ......... R$ 1,69/mês
 *
 * Um real por mês. Por isso NÃO recodificamos para comprimir: o ganho de
 * espaço não pagaria o custo de CPU na máquina do cliente, a perda de
 * qualidade da prova, e a troca do FFmpeg LGPL pelo GPL — que traria
 * obrigação de licença na redistribuição. O clipe continua sendo um recorte
 * do H.264 que a câmera já entrega (`-c:v copy` no Agent).
 * ------------------------------------------------------------------------
 */

/** Fallback quando não há configuração por câmera. */
export const MONITORIA_CLIP_DURATION_SECONDS = 15;

/**
 * Teto absoluto do clipe, em segundos.
 *
 * Amarrado ao buffer em anel do Agent: `KEEP_BUFFER_MS = 120_000` em
 * agent/src/clip-buffer.ts. O Agent mantém 2 minutos de vídeo; pedir mais
 * que isso produz clipe truncado sem aviso.
 *
 * Cobre 97,4% dos acontecimentos por inteiro. Para chegar aos 99% seria
 * preciso subir o buffer primeiro — e aí sobe também o disco temporário
 * usado no computador da loja. Não faça um sem o outro.
 */
export const MONITORIA_CLIP_MAX_DURATION_SECONDS = 120;

/** Margem antes do início do evento, para o clipe não começar cortado. */
export const MONITORIA_CLIP_PRE_ROLL_SECONDS = 3;

/** Margem depois do fim, pelo mesmo motivo. */
export const MONITORIA_CLIP_POST_ROLL_SECONDS = 2;

export const MONITORIA_CLIP_RETENTION_DAYS = 30;

/**
 * 25 MB continua suficiente. A 681 kbps — taxa real medida nos 391 clipes
 * já gravados — 120 segundos dão cerca de 15 MB.
 */
export const MONITORIA_CLIP_MAX_BYTES = 25 * 1024 * 1024;

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
 * Cobre do pré-roll ao pós-roll, limitado pelo teto da política e pelo
 * limite configurado para a câmera. Nunca devolve menos que o fallback,
 * para um evento de 2 segundos não gerar clipe inútil.
 *
 * `maxAllowedSeconds` vem de camera_entitlements.clip_duration_seconds e
 * funciona como limite superior, não como valor fixo.
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

import type { ReactNode } from "react";
import styles from "./landing.module.css";

/**
 * Base pública dos vídeos.
 *
 * REGRA: nenhum vídeo pode ser servido por rota da Vercel — isso vira Fast
 * Data Transfer. Suba para o Supabase Storage (bucket público `landing`) e
 * aponte a variável para a base do bucket.
 *
 * NEXT_PUBLIC_MEDIA_BASE_URL=https://xwejfayeackbrilipgrj.supabase.co/storage/v1/object/public/landing
 *
 * Sem a variável definida, os cards de setor caem no fundo desenhado em CSS
 * e a página continua completa e publicável.
 */
export const mediaBaseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL?.replace(/\/$/, "") ?? "";

export type SectorMediaId = "sector-store" | "sector-forecourt" | "sector-warehouse";

export function videoUrl(id: SectorMediaId) {
  return mediaBaseUrl ? `${mediaBaseUrl}/video/${id}.mp4` : null;
}

export function posterUrl(id: SectorMediaId) {
  return mediaBaseUrl ? `${mediaBaseUrl}/poster/${id}.jpg` : null;
}

/**
 * Moldura das cenas do produto.
 *
 * As cinco cenas do painel são SVG animado (ver scenes.tsx). Não há MP4 a
 * produzir para elas — este componente só desenha a barra superior e a borda.
 */
export function MediaSlot({
  label,
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={[styles.media, className].filter(Boolean).join(" ")}>
      {label ? (
        <figcaption className={styles.mediaBar}>
          <span>
            <i className={styles.dot} aria-hidden="true" />
            <b>{label}</b>
          </span>
          <span className={styles.mono}>MonitorIA.cam</span>
        </figcaption>
      ) : null}
      {children}
    </figure>
  );
}

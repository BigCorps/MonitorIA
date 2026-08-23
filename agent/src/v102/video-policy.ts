export const VIDEO_TARGET_KBPS = 600;
export const VIDEO_MAX_PASSTHROUGH_KBPS = 900;
export const VIDEO_MAX_HEIGHT = 720;
export const VIDEO_TARGET_FPS = 12;
export const VIDEO_MAX_CLIP_BYTES = 100 * 1024 * 1024;

export type VideoProbe = {
  codec: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  bitrateKbps: number | null;
};

export function shouldPassthroughVideo(probe: VideoProbe) {
  return probe.codec === "h264" &&
    (probe.height === null || probe.height <= VIDEO_MAX_HEIGHT) &&
    // Bitrate desconhecido não recebe passe livre: a timeline calcula um
    // fallback pelos bytes dos segmentos antes de chegar aqui. Se ainda for
    // desconhecido, comprimir é mais seguro que armazenar um main stream de
    // vários Mbps por engano.
    probe.bitrateKbps !== null &&
    probe.bitrateKbps <= VIDEO_MAX_PASSTHROUGH_KBPS;
}

export function transcodeVideoArguments() {
  return [
    "-an",
    "-vf",
    `fps=${VIDEO_TARGET_FPS},scale=w='min(1280,iw)':h=-2:force_original_aspect_ratio=decrease`,
    "-c:v",
    "libopenh264",
    "-b:v",
    `${VIDEO_TARGET_KBPS}k`,
    "-maxrate",
    `${Math.round(VIDEO_TARGET_KBPS * 1.25)}k`,
    "-bufsize",
    `${VIDEO_TARGET_KBPS * 2}k`,
    "-pix_fmt",
    "yuv420p",
  ];
}

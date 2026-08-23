import type { ClipUploadRequest } from "./types.js";
import {
  acquireTimeline,
  releaseTimeline,
  type CameraTimeline,
  type TimelineBuiltClip,
} from "./v102/timeline.js";

export type BuiltClip = TimelineBuiltClip;

/**
 * 1.0.2: compatibilidade de interface com o serviço antigo, mas sem abrir uma
 * segunda conexão RTSP. O EventMonitor e o clip buffer recebem a mesma
 * CameraTimeline do registry e apenas mantêm referências independentes.
 */
export class CircularClipBuffer {
  private timeline: CameraTimeline | null = null;
  private stopped = false;

  constructor(private readonly options: {
    cameraId: string;
    cameraName: string;
    ffmpegPath: string;
    rtspUrl: string;
    log: (message: string) => void;
  }) {}

  async start() {
    if (this.timeline || this.stopped) return;
    this.timeline = await acquireTimeline({
      ...this.options,
      captureIntervalSeconds: 1,
    });
    this.options.log(`Timeline compartilhada de vídeo ativa em "${this.options.cameraName}".`);
  }

  async buildClip(request: ClipUploadRequest | (ClipUploadRequest & { claimToken?: string; agentEventId?: string })) {
    if (!this.timeline) throw new Error("A timeline de vídeo não está disponível.");
    const agentEventId = "agentEventId" in request ? request.agentEventId : undefined;
    if (agentEventId) {
      const preserved = await this.timeline.preservedClip(agentEventId);
      if (preserved) return preserved;
    }
    return this.timeline.buildClip({
      requestId: request.requestId,
      eventId: request.eventId,
      clipStartsAt: request.clipStartsAt,
      clipEndsAt: request.clipEndsAt,
      durationSeconds: request.durationSeconds,
    });
  }

  async removePreservedClip(agentEventId: string) {
    await this.timeline?.removePreservedClip(agentEventId);
  }

  reconnectCount() { return this.timeline?.reconnectCount() ?? 0; }

  async diskStats() {
    return this.timeline?.diskStats() ?? null;
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timeline) await releaseTimeline(this.options.cameraId, this.timeline);
    this.timeline = null;
  }
}

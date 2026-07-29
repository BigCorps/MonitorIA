import { rm } from "node:fs/promises";
import {
  ApiError,
  submitCameraEvent,
} from "./api.js";
import type {
  LocalMotionEvent,
  EventSubmissionResponse,
} from "./types.js";

function sleep(milliseconds: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, milliseconds),
  );
}

async function cleanupEvent(event: LocalMotionEvent) {
  await Promise.allSettled(
    event.frames.map(({ frame }) =>
      rm(frame.path, { force: true }),
    ),
  );
}

export class EventSubmissionQueue {
  private readonly items: LocalMotionEvent[] = [];
  private processing = false;
  private accepting = true;
  private current: Promise<void> | null = null;

  constructor(
    private readonly options: {
      baseUrl: string;
      token: string;
      log: (message: string) => void;
      limit?: number;
    },
  ) {}

  size() {
    return this.items.length + (this.processing ? 1 : 0);
  }

  enqueue(event: LocalMotionEvent) {
    const limit = Math.max(
      1,
      Math.min(50, this.options.limit ?? 10),
    );

    if (!this.accepting || this.items.length >= limit) {
      this.options.log(
        `Fila cheia: evento ${event.eventId} de "${event.cameraName}" foi descartado.`,
      );
      void cleanupEvent(event);
      return false;
    }

    this.items.push(event);
    this.pump();
    return true;
  }

  private pump() {
    if (this.processing || !this.items.length) return;

    const event = this.items.shift();
    if (!event) return;

    this.processing = true;
    this.current = this.processEvent(event)
      .catch((error) => {
        this.options.log(
          `Falha definitiva no evento ${event.eventId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      })
      .finally(async () => {
        await cleanupEvent(event);
        this.processing = false;
        this.current = null;
        this.pump();
      });
  }

  private async processEvent(event: LocalMotionEvent) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        this.options.log(
          `Enviando evento ${event.eventId} de "${event.cameraName}" (tentativa ${attempt}/3)...`,
        );

        const response: EventSubmissionResponse =
          await submitCameraEvent(
            this.options.baseUrl,
            this.options.token,
            event,
          );

        if (response.pending) {
          this.options.log(
            `Evento ${event.eventId} ainda está em processamento no servidor.`,
          );

          if (attempt < 3) {
            await sleep(15_000);
            continue;
          }

          return;
        }

        if (response.relevant) {
          this.options.log(
            `Evento registrado: ${response.summary ?? response.type ?? response.eventId}.`,
          );
        } else {
          this.options.log(
            `Evento ${event.eventId} analisado sem mudança relevante.`,
          );
        }

        return;
      } catch (error) {
        lastError = error;

        const shouldRetry =
          !(error instanceof ApiError) ||
          error.status === 409 ||
          error.status >= 500;

        if (!shouldRetry || attempt === 3) {
          throw error;
        }

        await sleep(attempt === 1 ? 5_000 : 15_000);
      }
    }

    throw lastError;
  }

  async stop(timeoutMs = 20_000) {
    this.accepting = false;

    const deadline = Date.now() + timeoutMs;

    while (
      (this.processing || this.items.length) &&
      Date.now() < deadline
    ) {
      if (this.current) {
        await Promise.race([
          this.current,
          sleep(Math.min(1_000, deadline - Date.now())),
        ]);
      } else {
        await sleep(250);
      }
    }

    if (this.items.length) {
      const remaining = this.items.splice(0);
      await Promise.allSettled(remaining.map(cleanupEvent));
    }
  }
}

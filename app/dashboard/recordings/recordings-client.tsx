"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SiteSummary } from "@/src/lib/dashboard-data";
import {
  blobToDataUrl,
  dataUrlBase64,
  ensureNativePreview,
  extractFirstValidFrame,
  probeRecording,
  scanRecording,
} from "@/src/recordings/browser-engine";
import {
  extractRecordingClipWithFfmpeg,
  recordingBrowserMetadata,
} from "@/src/recordings/browser-ffmpeg";
import type {
  RecordingCameraConfig,
  RecordingPlanCode,
  RecordingVideoInfo,
} from "@/src/recordings/types";
import styles from "./recordings.module.css";

type SourceSummary = {
  id: string;
  name: string;
  siteId: string;
  siteName: string;
  status: string;
  planCode: RecordingPlanCode;
  profileReady: boolean;
  entitlement: {
    accessSource: string;
    monitoringAllowed: boolean;
    periodStartsAt: string | null;
    periodEndsAt: string | null;
    reason: string;
    clipEnabled: boolean;
  };
  quota: {
    limitSeconds: number;
    usedSeconds: number;
    remainingSeconds: number;
  };
};

type ProfileDraft = {
  id: string;
  version?: number;
  environmentDescription?: string;
  monitoringGoals?: string[];
  ignoreInstructions?: string[];
  zones?: Array<{
    id?: string;
    name: string;
    type: string;
    description: string;
  }>;
};

type SessionResult = {
  session: {
    id: string;
    status: string;
    durationSeconds: number;
    sourceStartedAt: string;
    sourceFilename: string;
    candidateCount: number;
    eventCount: number;
    completedEventCount: number;
    quotaSource: string;
    quotaLimitSeconds: number;
    mappingMs: number | null;
  };
  jobs: Array<{
    id: string;
    status: string;
    error: string | null;
  }>;
  events: Array<{
    id: string;
    headline: string;
    summary: string;
    confidence: number;
    requiresReview: boolean;
    startedAt: string;
    endedAt: string;
    type: string;
    thumbnailAssetId: string | null;
    clipAssetId: string | null;
  }>;
  pending: boolean;
  failedJobs: number;
};

type Props = {
  sites: SiteSummary[];
  initialSources: SourceSummary[];
  initialSourceId?: string;
  canManage: boolean;
};

const PLAN_LABELS: Record<RecordingPlanCode, string> = {
  basic: "Essencial",
  standard: "Atenta",
  intensive: "Detalhada",
};

const PLAN_DESCRIPTIONS: Record<RecordingPlanCode, string> = {
  basic: "1 imagem por acontecimento",
  standard: "até 3 imagens por acontecimento",
  intensive: "até 4 imagens e vídeo de evidência sob demanda",
};

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const rest = rounded % 60;

  return hours
    ? `${hours}h ${String(minutes).padStart(2, "0")}m`
    : `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function formatQuota(seconds: number) {
  if (seconds >= 3600) {
    return `${(seconds / 3600).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })} h`;
  }
  return formatDuration(seconds);
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value.toLocaleString("pt-BR", {
    maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2,
  })} ${units[index]}`;
}

function defaultRecordingStart(file: File) {
  const timestamp =
    Number.isFinite(file.lastModified) && file.lastModified > 0
      ? file.lastModified
      : Date.now();
  const date = new Date(timestamp);
  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return local.toISOString().slice(0, 16);
}

function localInputToIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Informe a data e a hora inicial da gravação.");
  }
  return date.toISOString();
}

function randomKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function deterministicUuid(value: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    ),
  );
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

async function jsonRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    throw new Error(
      String(
        payload.error ??
          `A operação falhou com HTTP ${response.status}.`,
      ),
    );
  }

  return payload as T;
}

async function sha256Hex(blob: Blob) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sourceTone(source: SourceSummary) {
  if (!source.profileReady) return "setup";
  if (source.entitlement.monitoringAllowed) return "ready";
  return "payment";
}

export function RecordingsClient({
  sites,
  initialSources,
  initialSourceId,
  canManage,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestKeyRef = useRef<string | null>(null);

  const [sources, setSources] = useState(initialSources);
  const [selectedSourceId, setSelectedSourceId] = useState(
    initialSourceId &&
      initialSources.some((source) => source.id === initialSourceId)
      ? initialSourceId
      : initialSources[0]?.id ?? "",
  );

  const [newSourceOpen, setNewSourceOpen] = useState(
    initialSources.length === 0,
  );
  const [newSourceName, setNewSourceName] = useState("Gravações");
  const [newSourceSiteId, setNewSourceSiteId] = useState(
    sites[0]?.id ?? "",
  );
  const [sourceBusy, setSourceBusy] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [videoInfo, setVideoInfo] =
    useState<RecordingVideoInfo | null>(null);
  const [recordingStart, setRecordingStart] = useState("");
  const [referenceBlob, setReferenceBlob] = useState<Blob | null>(
    null,
  );
  const [referencePreview, setReferencePreview] = useState<
    string | null
  >(null);
  const [referenceWidth, setReferenceWidth] = useState(1280);
  const [referenceHeight, setReferenceHeight] = useState(720);
  const [profileDraft, setProfileDraft] =
    useState<ProfileDraft | null>(null);
  const [profileGuidance, setProfileGuidance] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  const [trialPlan, setTrialPlan] =
    useState<RecordingPlanCode>("standard");
  const [recordingConfig, setRecordingConfig] =
    useState<RecordingCameraConfig | null>(null);

  const [status, setStatus] = useState(
    "Selecione uma origem e uma gravação para começar.",
  );
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionResult, setSessionResult] =
    useState<SessionResult | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<
    string | null
  >(null);
  const [clipBusyId, setClipBusyId] = useState<string | null>(null);

  const selectedSource = useMemo(
    () =>
      sources.find((source) => source.id === selectedSourceId) ??
      null,
    [sources, selectedSourceId],
  );

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setFile(null);
    setVideoInfo(null);
    setRecordingStart("");
    setReferenceBlob(null);
    setReferencePreview(null);
    setProfileDraft(null);
    setRecordingConfig(null);
    setSessionResult(null);
    setActiveSessionId(null);
    setProgress(0);
    setError(null);
    requestKeyRef.current = null;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, [selectedSourceId]);

  function patchSource(
    sourceId: string,
    patch: Partial<SourceSummary>,
  ) {
    setSources((current) =>
      current.map((source) =>
        source.id === sourceId
          ? {
              ...source,
              ...patch,
              entitlement: patch.entitlement
                ? { ...source.entitlement, ...patch.entitlement }
                : source.entitlement,
              quota: patch.quota
                ? { ...source.quota, ...patch.quota }
                : source.quota,
            }
          : source,
      ),
    );
  }

  async function createSource() {
    if (!newSourceName.trim() || !newSourceSiteId) return;
    setSourceBusy(true);
    setError(null);

    try {
      const result = await jsonRequest<{
        source: SourceSummary;
      }>("/api/recordings/sources", {
        method: "POST",
        body: JSON.stringify({
          name: newSourceName.trim(),
          siteId: newSourceSiteId,
        }),
      });

      const site = sites.find((item) => item.id === newSourceSiteId);
      const source: SourceSummary = {
        ...result.source,
        siteName: site?.name ?? "Local",
        status: result.source.status ?? "pending",
      };

      setSources((current) => [...current, source]);
      setSelectedSourceId(source.id);
      setNewSourceOpen(false);
      setStatus(
        "Origem criada. Escolha a primeira gravação para definir o contexto.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setSourceBusy(false);
    }
  }

  async function prepareFile(nextFile: File | null) {
    setFile(nextFile);
    setVideoInfo(null);
    setReferenceBlob(null);
    setReferencePreview(null);
    setProfileDraft(null);
    setSessionResult(null);
    setActiveSessionId(null);
    setRecordingConfig(null);
    setProgress(0);
    setError(null);
    requestKeyRef.current = null;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (!nextFile) {
      setStatus("Selecione uma gravação para começar.");
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setError("O leitor de vídeo ainda não está pronto.");
      return;
    }

    const objectUrl = URL.createObjectURL(nextFile);
    objectUrlRef.current = objectUrl;
    setRecordingStart(defaultRecordingStart(nextFile));
    setStatus("Identificando o formato localmente…");

    try {
      const native = await ensureNativePreview(video, objectUrl);
      const info = await probeRecording(nextFile, video);

      if (info.durationKnown && info.durationSeconds > 3600.5) {
        throw new Error(
          `Esta versão aceita até 1 hora por arquivo. O vídeo possui ${formatDuration(
            info.durationSeconds,
          )}.`,
        );
      }

      setVideoInfo(info);
      setStatus(
        native
          ? "Vídeo pronto para processamento local pelo navegador."
          : "Vídeo reconhecido pelo modo de compatibilidade local.",
      );

      if (selectedSource && !selectedSource.profileReady) {
        setStatus("Extraindo a primeira imagem válida para configurar o contexto…");
        const reference = await extractFirstValidFrame({
          file: nextFile,
          video,
          info,
        });
        setReferenceBlob(reference.blob);
        setReferenceWidth(reference.width ?? info.width ?? 1280);
        setReferenceHeight(reference.height ?? info.height ?? 720);
        setReferencePreview(await blobToDataUrl(reference.blob));
        setStatus(
          "Primeira imagem pronta. Revise e peça à IA para criar o contexto.",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
      setStatus("Não foi possível preparar esta gravação.");
    }
  }

  async function createProfile() {
    if (!selectedSource || !referenceBlob) return;
    setProfileBusy(true);
    setError(null);

    try {
      setStatus("Salvando somente a imagem de referência…");
      const referenceResponse = await fetch(
        `/api/recordings/cameras/${selectedSource.id}/reference-frame`,
        {
          method: "POST",
          headers: {
            "Content-Type": "image/jpeg",
            "x-monitoria-width": String(referenceWidth),
            "x-monitoria-height": String(referenceHeight),
            "x-monitoria-captured-at": new Date().toISOString(),
          },
          body: referenceBlob,
        },
      );

      const referencePayload = (await referenceResponse.json()) as {
        assetId?: string;
        error?: string;
      };

      if (!referenceResponse.ok || !referencePayload.assetId) {
        throw new Error(
          referencePayload.error ?? "reference_upload_failed",
        );
      }

      setStatus("A IA está entendendo o ambiente desta origem…");
      const profilePayload = await jsonRequest<{
        profile: ProfileDraft;
      }>(
        `/api/recordings/cameras/${selectedSource.id}/profile`,
        {
          method: "POST",
          body: JSON.stringify({
            sourceAssetId: referencePayload.assetId,
            userGuidance: profileGuidance.trim(),
          }),
        },
      );

      setProfileDraft(profilePayload.profile);
      setStatus(
        "Contexto criado. Confira o resumo e aprove para continuar.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setProfileBusy(false);
    }
  }

  async function activateProfile() {
    if (!selectedSource || !profileDraft?.id) return;
    setProfileBusy(true);
    setError(null);

    try {
      await jsonRequest(
        `/api/recordings/cameras/${selectedSource.id}/profile/activate`,
        {
          method: "POST",
          body: JSON.stringify({ profileId: profileDraft.id }),
        },
      );

      patchSource(selectedSource.id, { profileReady: true });
      setStatus(
        "Contexto aprovado. Agora escolha teste grátis ou plano.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setProfileBusy(false);
    }
  }

  async function loadConfig() {
    if (!selectedSource) {
      throw new Error("Selecione uma origem.");
    }

    const result = await jsonRequest<{
      config: RecordingCameraConfig;
    }>(`/api/recordings/cameras/${selectedSource.id}/config`);

    setRecordingConfig(result.config);
    return result.config;
  }

  async function startTrial() {
    if (!selectedSource) return;
    setSourceBusy(true);
    setError(null);

    try {
      const response = await jsonRequest<{
        trial: Record<string, unknown>;
        recordingLimitSeconds: number;
      }>("/api/recordings/trial", {
        method: "POST",
        body: JSON.stringify({
          cameraId: selectedSource.id,
          planCode: trialPlan,
        }),
      });

      patchSource(selectedSource.id, {
        planCode: trialPlan,
        entitlement: {
          ...selectedSource.entitlement,
          accessSource: "trial",
          monitoringAllowed: true,
          reason: "trial_running",
          clipEnabled: trialPlan === "intensive",
        },
        quota: {
          limitSeconds: response.recordingLimitSeconds ?? 600,
          usedSeconds: 0,
          remainingSeconds: response.recordingLimitSeconds ?? 600,
        },
      });

      await loadConfig();
      setStatus(
        "Teste iniciado. Nesta origem, o teste processa até 10 minutos de gravação.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setSourceBusy(false);
    }
  }

  async function waitForSession(sessionId: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await fetch(
        `/api/recordings/sessions/${sessionId}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as SessionResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "recording_results_unavailable");
      }

      setSessionResult(payload);

      if (!payload.pending) return payload;

      setStatus(
        `IA analisando os acontecimentos · ${payload.jobs.filter(
          (job) => job.status === "completed",
        ).length}/${payload.jobs.length}`,
      );
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, 3000),
      );
    }

    throw new Error(
      "A análise continua em segundo plano. Abra novamente esta origem em alguns minutos para consultar os resultados.",
    );
  }

  async function analyzeRecording() {
    if (!selectedSource || !file || !videoInfo || !recordingStart) {
      setError("Selecione uma gravação e informe o horário inicial.");
      return;
    }

    if (!selectedSource.profileReady) {
      setError("Aprove o contexto desta origem antes de analisar.");
      return;
    }

    setProcessing(true);
    setError(null);
    setProgress(0);
    setSessionResult(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let sessionId: string | null = null;

    try {
      const config = recordingConfig ?? (await loadConfig());
      const requestKey = requestKeyRef.current ?? randomKey();
      requestKeyRef.current = requestKey;
      const trial = config.entitlement.accessSource === "trial";
      const remainingFromSource =
        selectedSource.entitlement.accessSource === config.entitlement.accessSource
          ? selectedSource.quota.remainingSeconds
          : trial
            ? 600
            : 2_592_000;

      if (remainingFromSource <= 0) {
        throw new Error(
          trial
            ? "A franquia de 10 minutos deste teste já foi utilizada."
            : "A franquia de processamento desta origem já foi utilizada neste ciclo.",
        );
      }

      const maxProcessSeconds = Math.max(
        1,
        Math.min(3600, remainingFromSource),
      );

      setStatus(
        trial && (!videoInfo.durationKnown || videoInfo.durationSeconds > 600)
          ? "Mapeando localmente os primeiros 10 minutos do teste…"
          : "Mapeando acontecimentos localmente…",
      );

      const scan = await scanRecording({
        file,
        video: videoRef.current!,
        info: videoInfo,
        sourceStartedAt: new Date(localInputToIso(recordingStart)),
        config,
        maxDurationSeconds: maxProcessSeconds,
        signal: controller.signal,
        onProgress: (value, message) => {
          setProgress(Math.min(70, Math.round(value * 0.7)));
          setStatus(message);
        },
      });

      if (controller.signal.aborted) {
        throw new Error("analysis_cancelled");
      }

      const sourceStartedAt = localInputToIso(recordingStart);
      setStatus(
        `Mapeamento concluído: ${scan.candidates.length} acontecimento(s). Reservando ${formatDuration(
          scan.durationSeconds,
        )} da franquia…`,
      );

      const reserved = await jsonRequest<{
        sessionId: string;
        quotaSource: string;
        planCode: RecordingPlanCode;
        quotaLimitSeconds: number;
        quotaUsedSeconds?: number;
        quotaRemainingSeconds?: number;
      }>("/api/recordings/sessions", {
        method: "POST",
        body: JSON.stringify({
          cameraId: selectedSource.id,
          requestKey,
          sourceFilename: file.name,
          fileSizeBytes: file.size,
          durationSeconds: Math.max(
            1,
            Math.min(3600, Math.ceil(scan.durationSeconds)),
          ),
          sourceStartedAt,
          codec: videoInfo.codec,
          width: videoInfo.width,
          height: videoInfo.height,
          decoderMode: videoInfo.decoderMode,
          nativePreview: videoInfo.nativePreview,
          browserMetadata: recordingBrowserMetadata(),
        }),
      });

      sessionId = reserved.sessionId;
      setActiveSessionId(sessionId);

      await jsonRequest(`/api/recordings/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "processing_started" }),
      });

      patchSource(selectedSource.id, {
        planCode: reserved.planCode,
        quota: {
          limitSeconds: reserved.quotaLimitSeconds,
          usedSeconds:
            reserved.quotaLimitSeconds -
            Number(reserved.quotaRemainingSeconds ?? 0),
          remainingSeconds: Number(
            reserved.quotaRemainingSeconds ?? 0,
          ),
        },
      });

      const maximumEvents = Math.max(
        1,
        Math.ceil(scan.durationSeconds / 15),
      );
      const candidatesToSubmit = scan.candidates.slice(0, maximumEvents);

      if (scan.candidates.length > candidatesToSubmit.length) {
        setStatus(
          `${scan.candidates.length} mudanças encontradas; ${candidatesToSubmit.length} seguem para IA pelo limite de proteção contra vídeo ruidoso.`,
        );
      }

      let accepted = 0;
      for (
        let index = 0;
        index < candidatesToSubmit.length;
        index += 1
      ) {
        if (controller.signal.aborted) {
          throw new Error("analysis_cancelled");
        }

        const candidate = candidatesToSubmit[index]!;
        const stableEventId = await deterministicUuid(
          `${requestKey}:${index}:${candidate.startedAtSeconds.toFixed(
            3,
          )}:${candidate.endedAtSeconds.toFixed(3)}`,
        );
        setStatus(
          `Enviando evidências para a IA · ${index + 1}/${candidatesToSubmit.length}`,
        );
        setProgress(
          70 +
            Math.round(
              ((index + 1) /
                Math.max(1, candidatesToSubmit.length)) *
                25,
            ),
        );

        await jsonRequest(
          `/api/recordings/cameras/${selectedSource.id}/events`,
          {
            method: "POST",
            body: JSON.stringify({
              eventId: stableEventId,
              recordingSessionId: sessionId,
              startedAt: candidate.startedAt,
              endedAt: candidate.endedAt,
              localMetrics: candidate.localMetrics,
              frames: candidate.frames.map((frame) => ({
                label: frame.label,
                capturedAt: frame.capturedAt,
                imageBase64: dataUrlBase64(frame.imageUrl),
                width: frame.width,
                height: frame.height,
                byteSize: frame.byteSize,
                timeline: {
                  source: "local_recording",
                  offsetMs: Math.max(
                    0,
                    Math.round(frame.offsetSeconds * 1000),
                  ),
                  sourceTimestamp: frame.capturedAt,
                },
              })),
            }),
          },
        );

        accepted += 1;
      }

      await jsonRequest(`/api/recordings/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "submission_complete",
          candidateCount: scan.candidates.length,
          eventCount: accepted,
          mappingMs: scan.mappingMs,
        }),
      });

      setProgress(96);

      if (accepted === 0) {
        const result = await waitForSession(sessionId);
        setProgress(100);
        setStatus(
          result.events.length
            ? "Análise concluída."
            : "Processamento concluído. Nenhum acontecimento relevante foi encontrado.",
        );
      } else {
        const result = await waitForSession(sessionId);
        setProgress(100);
        setStatus(
          result.failedJobs
            ? `Concluído com ${result.failedJobs} análise(s) que precisam de nova tentativa.`
            : "Análise concluída. Os resultados já entraram no histórico normal do MonitorIA.",
        );
      }
      requestKeyRef.current = null;
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : String(caught);

      if (sessionId) {
        await fetch(`/api/recordings/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action:
              message === "analysis_cancelled" ? "cancelled" : "failed",
            ...(message === "analysis_cancelled"
              ? {}
              : {
                  errorCode: "recording_processing_failed",
                  errorMessage: message.slice(0, 1200),
                }),
          }),
        }).catch(() => undefined);
      }

      if (message !== "analysis_cancelled") {
        setError(message);
        setStatus("A análise foi interrompida.");
      } else {
        setStatus("Processamento cancelado.");
      }
    } finally {
      setProcessing(false);
      abortRef.current = null;
    }
  }

  async function generateClip(eventId: string) {
    if (!activeSessionId || !file || !selectedSource) return;
    setClipBusyId(eventId);
    setError(null);

    try {
      const prepared = await jsonRequest<{
        ready: boolean;
        assetId: string;
        signedUrl?: string;
        offsetSeconds?: number;
        durationSeconds?: number;
      }>("/api/recordings/clips/prepare", {
        method: "POST",
        body: JSON.stringify({
          sessionId: activeSessionId,
          eventId,
        }),
      });

      if (prepared.ready) {
        await waitForSession(activeSessionId);
        return;
      }

      if (
        !prepared.signedUrl ||
        prepared.offsetSeconds === undefined ||
        prepared.durationSeconds === undefined
      ) {
        throw new Error("clip_upload_not_prepared");
      }

      setStatus("Preparando o vídeo de evidência localmente…");
      const clip = await extractRecordingClipWithFfmpeg({
        file,
        offsetSeconds: prepared.offsetSeconds,
        durationSeconds: prepared.durationSeconds,
        onProgress: (value) =>
          setProgress(Math.max(0, Math.min(99, value))),
      });

      const form = new FormData();
      form.append("file", clip, "clip.mp4");
      form.append("cacheControl", "3600");

      const upload = await fetch(prepared.signedUrl, {
        method: "PUT",
        headers: { "x-upsert": "true" },
        body: form,
      });

      if (!upload.ok) {
        throw new Error(
          `O upload do vídeo de evidência falhou com HTTP ${upload.status}.`,
        );
      }

      await jsonRequest("/api/recordings/clips/complete", {
        method: "POST",
        body: JSON.stringify({
          assetId: prepared.assetId,
          byteSize: clip.size,
          contentSha256: await sha256Hex(clip),
          durationSeconds: prepared.durationSeconds,
        }),
      });

      await waitForSession(activeSessionId);
      setStatus("Vídeo de evidência pronto.");
      setProgress(100);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setClipBusyId(null);
    }
  }

  const entitlementReady =
    selectedSource?.entitlement.monitoringAllowed ||
    recordingConfig?.entitlement.monitoringAllowed;

  const profileReady =
    selectedSource?.profileReady ?? false;

  return (
    <div className={styles.workspace}>
      <section className={styles.sourcePanel}>
        <div className={styles.sectionTitle}>
          <div>
            <span>ORIGENS</span>
            <h2>Vídeos enviados</h2>
          </div>
          {canManage ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setNewSourceOpen((value) => !value)}
            >
              + Nova origem
            </button>
          ) : null}
        </div>

        {newSourceOpen ? (
          <div className={styles.createSource}>
            <label>
              Nome da origem
              <input
                value={newSourceName}
                onChange={(event) => setNewSourceName(event.target.value)}
                placeholder="Ex.: Câmera do depósito"
                maxLength={160}
              />
            </label>
            <label>
              Local
              <select
                value={newSourceSiteId}
                onChange={(event) =>
                  setNewSourceSiteId(event.target.value)
                }
              >
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={sourceBusy || !canManage}
              onClick={createSource}
            >
              {sourceBusy ? "Criando…" : "Criar origem"}
            </button>
          </div>
        ) : null}

        <div className={styles.sourceList}>
          {sources.map((source) => (
            <button
              type="button"
              key={source.id}
              className={
                source.id === selectedSourceId
                  ? styles.sourceActive
                  : styles.sourceCard
              }
              onClick={() => setSelectedSourceId(source.id)}
            >
              <div>
                <strong>{source.name}</strong>
                <span>{source.siteName}</span>
              </div>
              <small data-tone={sourceTone(source)}>
                {!source.profileReady
                  ? "Configurar"
                  : source.entitlement.monitoringAllowed
                    ? PLAN_LABELS[source.planCode]
                    : "Escolher plano"}
              </small>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.mainPanel}>
        {!selectedSource ? (
          <div className={styles.empty}>
            <strong>Crie sua primeira origem de gravações</strong>
            <p>
              Ela funciona como uma câmera no MonitorIA, mas recebe arquivos
              escolhidos no computador ou celular.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.sourceHeader}>
              <div>
                <span>ORIGEM SELECIONADA</span>
                <h2>{selectedSource.name}</h2>
                <p>
                  {selectedSource.siteName} ·{" "}
                  {profileReady
                    ? "contexto aprovado"
                    : "aguardando contexto"}
                </p>
              </div>
              <div className={styles.quotaBox}>
                <span>Franquia do ciclo</span>
                <strong>
                  {selectedSource.entitlement.monitoringAllowed
                    ? formatQuota(selectedSource.quota.remainingSeconds)
                    : "—"}
                </strong>
                <small>
                  {!selectedSource.entitlement.monitoringAllowed
                    ? "ative um teste ou plano"
                    : selectedSource.entitlement.accessSource === "trial"
                      ? "restantes no teste"
                      : "restantes para esta origem"}
                </small>
              </div>
            </div>

            <div className={styles.privacyStrip}>
              <strong>Arquivo original: somente neste dispositivo</strong>
              <span>
                O navegador lê a gravação localmente. O backend recebe apenas
                as evidências JPEG selecionadas e, na Detalhada, um clipe
                somente quando você pedir.
              </span>
            </div>

            <section className={styles.fileCard}>
              <div className={styles.sectionTitle}>
                <div>
                  <span>1 · ARQUIVO</span>
                  <h3>Escolha a gravação</h3>
                </div>
                {file ? (
                  <small>
                    {file.name} · {formatBytes(file.size)}
                  </small>
                ) : null}
              </div>

              <label className={styles.filePicker}>
                <input
                  type="file"
                  accept="video/*,.mp4,.mov,.m4v,.avi,.mkv,.hevc,.h265"
                  onChange={(event) =>
                    void prepareFile(event.target.files?.[0] ?? null)
                  }
                  disabled={processing}
                />
                <strong>
                  {file ? "Trocar gravação" : "Selecionar gravação"}
                </strong>
                <span>
                  Até 1 hora por arquivo · MP4, MOV e exports de câmeras
                </span>
              </label>

              <video
                ref={videoRef}
                className={styles.hiddenVideo}
                muted
                playsInline
                preload="metadata"
              />

              {videoInfo ? (
                <div className={styles.fileFacts}>
                  <span>
                    <small>Duração</small>
                    <strong>
                      {videoInfo.durationKnown
                        ? formatDuration(videoInfo.durationSeconds)
                        : "confirmada durante o mapeamento"}
                    </strong>
                  </span>
                  <span>
                    <small>Leitura</small>
                    <strong>
                      {videoInfo.decoderMode === "native"
                        ? "Nativa do navegador"
                        : "Compatibilidade local"}
                    </strong>
                  </span>
                  <span>
                    <small>Resolução</small>
                    <strong>
                      {videoInfo.width && videoInfo.height
                        ? `${videoInfo.width}×${videoInfo.height}`
                        : "detectada durante a leitura"}
                    </strong>
                  </span>
                  <label>
                    <small>Início da gravação</small>
                    <input
                      type="datetime-local"
                      value={recordingStart}
                      onChange={(event) => {
                        requestKeyRef.current = null;
                        setRecordingStart(event.target.value);
                      }}
                    />
                  </label>
                </div>
              ) : null}
            </section>

            {!profileReady ? (
              <section className={styles.setupCard}>
                <div className={styles.sectionTitle}>
                  <div>
                    <span>2 · CONTEXTO</span>
                    <h3>Configure esta origem uma única vez</h3>
                  </div>
                </div>

                {referencePreview ? (
                  <div className={styles.referenceGrid}>
                    <img
                      src={referencePreview}
                      alt="Primeira imagem válida da gravação"
                    />
                    <div>
                      <label>
                        O que a IA deve saber? <em>opcional</em>
                        <textarea
                          value={profileGuidance}
                          onChange={(event) =>
                            setProfileGuidance(event.target.value)
                          }
                          placeholder="Ex.: câmera fixa do caixa; ignore a televisão no canto."
                          maxLength={2000}
                        />
                      </label>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={profileBusy || !canManage}
                        onClick={createProfile}
                      >
                        {profileBusy
                          ? "Analisando contexto…"
                          : profileDraft
                            ? "Gerar novamente"
                            : "Criar contexto com IA"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className={styles.muted}>
                    Selecione uma gravação. O MonitorIA extrairá somente a
                    primeira imagem válida para configurar esta origem.
                  </p>
                )}

                {profileDraft ? (
                  <div className={styles.profileReview}>
                    <div>
                      <span>CONTEXTO PROPOSTO</span>
                      <h4>
                        {profileDraft.environmentDescription ??
                          "Contexto visual criado"}
                      </h4>
                      <p>
                        {(profileDraft.monitoringGoals ?? []).join(" · ")}
                      </p>
                    </div>
                    {(profileDraft.zones ?? []).length ? (
                      <div className={styles.zoneChips}>
                        {profileDraft.zones?.map((zone) => (
                          <span key={`${zone.name}-${zone.type}`}>
                            {zone.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={profileBusy || !canManage}
                      onClick={activateProfile}
                    >
                      Aprovar contexto
                    </button>
                  </div>
                ) : null}
              </section>
            ) : !entitlementReady ? (
              <section className={styles.setupCard}>
                <div className={styles.sectionTitle}>
                  <div>
                    <span>2 · ATIVAR</span>
                    <h3>Teste antes de contratar</h3>
                  </div>
                </div>

                <p className={styles.muted}>
                  O mesmo teste grátis da MonitorIA vale para gravações. Nesta
                  origem, a franquia do teste é de até 10 minutos processados.
                </p>

                <div className={styles.planChoice}>
                  {(
                    ["basic", "standard", "intensive"] as RecordingPlanCode[]
                  ).map((plan) => (
                    <button
                      type="button"
                      key={plan}
                      data-selected={trialPlan === plan}
                      onClick={() => setTrialPlan(plan)}
                    >
                      <strong>{PLAN_LABELS[plan]}</strong>
                      <span>{PLAN_DESCRIPTIONS[plan]}</span>
                    </button>
                  ))}
                </div>

                <div className={styles.activationActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={sourceBusy || !canManage}
                    onClick={startTrial}
                  >
                    {sourceBusy
                      ? "Ativando…"
                      : "Iniciar teste de até 10 minutos"}
                  </button>
                  <Link
                    href="/dashboard/plans"
                    className={styles.secondaryLink}
                  >
                    Contratar um plano
                  </Link>
                </div>
              </section>
            ) : (
              <section className={styles.analysisCard}>
                <div className={styles.sectionTitle}>
                  <div>
                    <span>2 · ANALISAR</span>
                    <h3>
                      {PLAN_LABELS[
                        recordingConfig?.planCode ??
                          selectedSource.planCode
                      ]}
                    </h3>
                  </div>
                  <small>
                    {PLAN_DESCRIPTIONS[
                      recordingConfig?.planCode ??
                        selectedSource.planCode
                    ]}
                  </small>
                </div>

                <div className={styles.analysisActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={
                      processing ||
                      !file ||
                      !videoInfo ||
                      !recordingStart ||
                      !canManage
                    }
                    onClick={analyzeRecording}
                  >
                    {processing
                      ? "Processando…"
                      : "Analisar esta gravação"}
                  </button>

                  {processing ? (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => abortRef.current?.abort()}
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>

                <div
                  className={styles.progressTrack}
                  aria-label="Progresso da gravação"
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
                <p className={styles.statusText}>{status}</p>
              </section>
            )}

            {error ? (
              <div className={styles.errorBox}>
                <strong>Não foi possível concluir</strong>
                <span>{error}</span>
              </div>
            ) : null}

            {sessionResult ? (
              <section className={styles.results}>
                <div className={styles.sectionTitle}>
                  <div>
                    <span>RESULTADOS</span>
                    <h3>
                      {sessionResult.events.length
                        ? `${sessionResult.events.length} acontecimento(s) relevante(s)`
                        : "Nenhum acontecimento relevante"}
                    </h3>
                  </div>
                  <small>
                    {sessionResult.session.candidateCount} candidato(s) local(is)
                  </small>
                </div>

                {sessionResult.events.length ? (
                  <div className={styles.eventGrid}>
                    {sessionResult.events.map((event) => (
                      <article className={styles.eventCard} key={event.id}>
                        {event.thumbnailAssetId ? (
                          <img
                            src={`/api/storage-assets/${event.thumbnailAssetId}`}
                            alt=""
                          />
                        ) : (
                          <div className={styles.noPreview}>MonitorIA</div>
                        )}

                        <div className={styles.eventBody}>
                          <div>
                            <span>
                              {new Intl.DateTimeFormat("pt-BR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              }).format(new Date(event.startedAt))}
                            </span>
                            <strong>
                              {event.headline || event.summary}
                            </strong>
                            <p>{event.summary}</p>
                          </div>

                          <div className={styles.eventActions}>
                            <Link href={`/dashboard/events/${event.id}`}>
                              Abrir acontecimento
                            </Link>

                            {event.clipAssetId ? (
                              <a
                                href={`/api/storage-assets/${event.clipAssetId}?download=1`}
                              >
                                Baixar vídeo
                              </a>
                            ) : (
                              (recordingConfig?.planCode ??
                                selectedSource.planCode) === "intensive" &&
                              file?.name ===
                                sessionResult.session.sourceFilename ? (
                                <button
                                  type="button"
                                  disabled={clipBusyId === event.id}
                                  onClick={() => generateClip(event.id)}
                                >
                                  {clipBusyId === event.id
                                    ? "Gerando vídeo…"
                                    : "Gerar vídeo da evidência"}
                                </button>
                              ) : null
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyResult}>
                    <strong>A gravação foi processada</strong>
                    <p>
                      O detector local não encontrou algo que justificasse um
                      acontecimento relevante, ou a IA descartou as mudanças
                      como não relevantes.
                    </p>
                  </div>
                )}
              </section>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

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
  recordingBrowserMetadata,
} from "@/src/recordings/browser-ffmpeg";
import type {
  RecordingCameraConfig,
  RecordingPlanCode,
  RecordingVideoInfo,
} from "@/src/recordings/types";
import styles from "./recordings.module.css";
import onboardingStyles from "../first-run.module.css";

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
    cameraId: string;
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
  initialSessionId?: string;
  canManage: boolean;
};

const PLAN_LABELS: Record<RecordingPlanCode, string> = {
  basic: "Essencial",
  standard: "Atenta",
  intensive: "Detalhada",
};

const PLAN_DESCRIPTIONS: Record<RecordingPlanCode, string> = {
  basic: "Uma visão objetiva dos principais acontecimentos",
  standard: "Mais contexto para entender o que aconteceu",
  intensive: "Análise mais completa, com detalhes extras quando necessário",
};

const TRIAL_RECORDING_LIMIT_SECONDS = 86_400;
const MAX_RECORDING_ENVIRONMENTS = 6;

const RECORDING_ERROR_MESSAGES: Record<string, string> = {
  authentication_required:
    "Sua sessão expirou. Entre novamente para continuar.",
  not_authorized:
    "Sua conta não tem permissão para fazer esta alteração.",
  organization_not_found:
    "Não encontramos sua empresa. Atualize a página e tente novamente.",
  recording_source_not_found:
    "Não encontramos este ambiente. Atualize a página e tente novamente.",
  recording_source_not_ready:
    "Confirme o ambiente desta gravação antes de iniciar o teste.",
  recording_site_not_found:
    "Não encontramos o local selecionado.",
  recording_source_create_failed:
    "Não foi possível preparar este ambiente agora. Tente novamente.",
  recording_environment_limit_reached:
    "Você pode criar até 6 ambientes para testar gravações.",
  recording_entitlement_unavailable:
    "Não foi possível verificar seu acesso agora. Tente novamente.",
  recording_entitlement_required:
    "Escolha o teste grátis ou um plano para analisar este vídeo.",
  recording_quota_exceeded:
    "Você já utilizou todo o tempo de vídeo disponível neste período.",
  trial_already_used:
    "O teste grátis desta conta já foi utilizado.",
  user_trial_already_used:
    "O teste grátis já foi utilizado anteriormente.",
  camera_trial_already_used:
    "Esta câmera já foi utilizada em outro teste.",
  device_trial_already_used:
    "Este dispositivo já foi utilizado em outro teste grátis.",
  organization_already_paid:
    "Esta conta já possui um pagamento confirmado.",
  organization_already_subscribed:
    "Esta conta já possui um plano ativo.",
  email_confirmation_required:
    "Confirme seu e-mail antes de iniciar o teste.",
  trial_selection_locked:
    "Já existe um teste em andamento nesta conta.",
  trial_camera_not_ready:
    "Confirme o ambiente desta gravação antes de iniciar o teste.",
  trial_not_prepared:
    "Não foi possível preparar o teste. Tente novamente.",
  trial_cannot_be_started:
    "Este teste não pode ser iniciado novamente.",
  trial_prepare_failed:
    "Não foi possível iniciar o teste agora. Tente novamente em instantes.",
  invalid_trial_plan:
    "Escolha uma opção de análise para continuar.",
  invalid_trial_request:
    "Não foi possível iniciar o teste com estas informações.",
  invalid_camera_id:
    "Não encontramos esta gravação. Atualize a página e tente novamente.",
  reference_upload_failed:
    "Não foi possível preparar a imagem deste ambiente. Tente novamente.",
  profile_activation_failed:
    "Não foi possível confirmar o ambiente. Tente novamente.",
  recording_results_unavailable:
    "Os resultados ainda não estão disponíveis. Tente novamente em instantes.",
  recording_event_limit_unavailable:
    "Não foi possível analisar este vídeo agora. Tente novamente em instantes.",
  clip_upload_not_prepared:
    "Não foi possível preparar o trecho do vídeo agora.",
};

function recordingErrorMessage(value: unknown, status?: number) {
  const raw = String(value ?? "").trim();

  for (const [code, message] of Object.entries(
    RECORDING_ERROR_MESSAGES,
  )) {
    if (raw === code || raw.includes(code)) return message;
  }

  if (status === 401) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }

  if (status === 403) {
    return "Sua conta não tem permissão para fazer esta alteração.";
  }

  if (
    /codec|canvas|jpeg|ffmpeg|compatibilidade|workerfs|webassembly/i.test(
      raw,
    )
  ) {
    return "Não conseguimos ler este vídeo neste dispositivo. Tente outro arquivo MP4 ou MOV.";
  }

  const looksInternal =
    !raw ||
    /^[a-z0-9_.:-]+$/i.test(raw) ||
    /violates|constraint|postgres|supabase|http \d+/i.test(raw);

  return looksInternal
    ? "Não foi possível concluir agora. Tente novamente."
    : raw;
}

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

function formatEventPeriod(
  startedAt: string,
  endedAt: string,
) {
  const start = new Date(startedAt);
  const end = new Date(endedAt);

  const date = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(start);

  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeStyle: "medium",
  });

  return `${date} · ${formatter.format(start)}–${formatter.format(end)}`;
}

function formatTrialEnd(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
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
      typeof payload.message === "string"
        ? payload.message
        : recordingErrorMessage(payload.error, response.status),
    );
  }

  return payload as T;
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
  initialSessionId,
  canManage,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestKeyRef = useRef<string | null>(null);
  const restoredSessionRef = useRef<string | null>(null);
  const previousSourceIdRef = useRef<string | null>(
    initialSourceId ?? initialSources[0]?.id ?? null,
  );

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
    "Selecione um vídeo para começar.",
  );
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionResult, setSessionResult] =
    useState<SessionResult | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<
    string | null
  >(null);

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
    const previousSourceId = previousSourceIdRef.current;
    const sourceChanged =
      previousSourceId !== null &&
      previousSourceId !== selectedSourceId;

    previousSourceIdRef.current = selectedSourceId || null;

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
    restoredSessionRef.current = null;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (
      sourceChanged &&
      typeof window !== "undefined"
    ) {
      const url = new URL(window.location.href);

      if (selectedSourceId) {
        url.searchParams.set("source", selectedSourceId);
      }

      url.searchParams.delete("session");

      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  }, [selectedSourceId]);

  function rememberSession(sessionId: string) {
    if (typeof window === "undefined" || !selectedSource) return;

    const url = new URL(window.location.href);
    url.searchParams.set("source", selectedSource.id);
    url.searchParams.set("session", sessionId);

    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  function clearSessionFromUrl() {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    url.searchParams.delete("session");

    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  function testAnotherVideo() {
    clearSessionFromUrl();
    restoredSessionRef.current = null;
    void prepareFile(null);
    setStatus("Escolha outro vídeo para continuar testando.");

    window.setTimeout(() => {
      document
        .getElementById("recording-file")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 0);
  }

  function addAnotherEnvironment() {
    if (sources.length >= MAX_RECORDING_ENVIRONMENTS) {
      setError(
        "Você pode criar até 6 ambientes para testar gravações.",
      );
      return;
    }

    clearSessionFromUrl();
    setNewSourceOpen(true);

    window.setTimeout(() => {
      document
        .getElementById("recording-environments")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 0);
  }

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

    if (sources.length >= MAX_RECORDING_ENVIRONMENTS) {
      setError(
        "Você pode criar até 6 ambientes para testar gravações.",
      );
      return;
    }

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
        "Tudo pronto. Escolha uma gravação para começar.",
      );
    } catch (caught) {
      setError(
        recordingErrorMessage(
          caught instanceof Error ? caught.message : String(caught),
        ),
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
    setStatus("Preparando seu vídeo…");

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
          ? "Vídeo pronto para análise."
          : "Vídeo pronto para análise.",
      );

      if (selectedSource && !selectedSource.profileReady) {
        setStatus("Preparando uma imagem para entender o ambiente…");
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
          "Imagem pronta. Confira o ambiente antes de continuar.",
        );
      }
    } catch (caught) {
      setError(
        recordingErrorMessage(
          caught instanceof Error ? caught.message : String(caught),
        ),
      );
      setStatus("Não foi possível preparar esta gravação.");
    }
  }

  async function createProfile() {
    if (!selectedSource || !referenceBlob) return;
    setProfileBusy(true);
    setError(null);

    try {
      setStatus("Preparando o ambiente…");
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

      setStatus("A IA está entendendo este ambiente…");
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
        "Ambiente identificado. Confira o resumo e confirme para continuar.",
      );
    } catch (caught) {
      setError(
        recordingErrorMessage(
          caught instanceof Error ? caught.message : String(caught),
        ),
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
        "Ambiente confirmado. Agora você pode iniciar o teste grátis.",
      );
    } catch (caught) {
      setError(
        recordingErrorMessage(
          caught instanceof Error ? caught.message : String(caught),
        ),
      );
    } finally {
      setProfileBusy(false);
    }
  }

  async function loadConfig() {
    if (!selectedSource) {
      throw new Error("Escolha um ambiente.");
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
        planCode?: RecordingPlanCode;
        recordingLimitSeconds: number;
        recordingUsedSeconds?: number;
        recordingRemainingSeconds?: number;
      }>("/api/recordings/trial", {
        method: "POST",
        body: JSON.stringify({
          cameraId: selectedSource.id,
          planCode: trialPlan,
        }),
      });

      const effectivePlan =
        response.planCode ?? trialPlan;

      const limit =
        response.recordingLimitSeconds ??
        TRIAL_RECORDING_LIMIT_SECONDS;

      const used = Number(
        response.recordingUsedSeconds ?? 0,
      );

      const remaining = Number(
        response.recordingRemainingSeconds ??
          Math.max(limit - used, 0),
      );

      setSources((current) =>
        current.map((source) => {
          if (
            ["subscription", "grace_period", "legacy"].includes(
              source.entitlement.accessSource,
            )
          ) {
            return source;
          }

          return {
            ...source,
            planCode: effectivePlan,
            entitlement: {
              ...source.entitlement,
              accessSource: "trial",
              monitoringAllowed: true,
              reason: "active_trial",
              clipEnabled: false,
            },
            quota: {
              limitSeconds: limit,
              usedSeconds: used,
              remainingSeconds: remaining,
            },
          };
        }),
      );

      await loadConfig();

      setStatus(
        "Teste iniciado. Você pode usar até 6 ambientes e analisar até 24 horas de gravações durante as próximas 24 horas.",
      );
    } catch (caught) {
      setError(
        recordingErrorMessage(
          caught instanceof Error
            ? caught.message
            : String(caught),
        ),
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

      setStatus("Analisando seus acontecimentos…");
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, 3000),
      );
    }

    throw new Error(
      "A análise continua em segundo plano. Abra novamente esta origem em alguns minutos para consultar os resultados.",
    );
  }


  useEffect(() => {
    const selectedSourceIdToRestore = selectedSource?.id;

    if (!initialSessionId || !selectedSourceIdToRestore) return;

    const sessionIdToRestore: string = initialSessionId;
    const sourceIdToRestore: string = selectedSourceIdToRestore;

    if (restoredSessionRef.current === sessionIdToRestore) return;

    restoredSessionRef.current = sessionIdToRestore;
    let cancelled = false;

    async function restoreSession() {
      setError(null);
      setStatus("Recuperando sua análise…");

      try {
        const response = await fetch(
          `/api/recordings/sessions/${sessionIdToRestore}`,
          { cache: "no-store" },
        );

        const payload = (await response.json()) as SessionResult & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(
            recordingErrorMessage(payload.error, response.status),
          );
        }

        if (cancelled) return;

        if (payload.session.cameraId !== sourceIdToRestore) {
          throw new Error(
            "Esta análise pertence a outro ambiente.",
          );
        }

        setActiveSessionId(sessionIdToRestore);
        setSessionResult(payload);

        if (payload.pending) {
          setProcessing(true);
          setProgress(96);
          setStatus("Analisando seus acontecimentos…");

          const finalResult = await waitForSession(sessionIdToRestore);

          if (cancelled) return;

          setSessionResult(finalResult);
          setProgress(100);
          setStatus(
            finalResult.events.length
              ? "Análise concluída. Seus acontecimentos estão prontos."
              : "Análise concluída. Não encontramos acontecimentos relevantes.",
          );
        } else {
          setProgress(100);
          setStatus(
            payload.events.length
              ? "Análise concluída. Seus acontecimentos estão prontos."
              : "Análise concluída. Não encontramos acontecimentos relevantes.",
          );
        }
      } catch (caught) {
        if (cancelled) return;
        restoredSessionRef.current = null;
        const message =
          caught instanceof Error ? caught.message : String(caught);
        setError(recordingErrorMessage(message));
      } finally {
        if (!cancelled) setProcessing(false);
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [initialSessionId, selectedSource?.id]);

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
            ? TRIAL_RECORDING_LIMIT_SECONDS
            : 2_592_000;

      if (remainingFromSource <= 0) {
        throw new Error(
          trial
            ? "O tempo de gravações disponível no teste de 24 horas já foi utilizado."
            : "O tempo disponível para analisar vídeos neste período já foi utilizado.",
        );
      }

      const maxProcessSeconds = Math.max(
        1,
        Math.min(3600, remainingFromSource),
      );

      setStatus(
        videoInfo.durationKnown &&
          videoInfo.durationSeconds > maxProcessSeconds
          ? `Analisando até ${formatDuration(
              maxProcessSeconds,
            )}, que é o tempo disponível neste momento…`
          : "Analisando o vídeo…",
      );

      const scan = await scanRecording({
        file,
        video: videoRef.current!,
        info: videoInfo,
        sourceStartedAt: new Date(localInputToIso(recordingStart)),
        config,
        maxDurationSeconds: maxProcessSeconds,
        signal: controller.signal,
        onProgress: (value, _message) => {
          setProgress(Math.min(70, Math.round(value * 0.7)));
          setStatus("Analisando o vídeo…");
        },
      });

      if (controller.signal.aborted) {
        throw new Error("analysis_cancelled");
      }

      const sourceStartedAt = localInputToIso(recordingStart);
      setStatus(
        scan.candidates.length
          ? `Encontramos ${scan.candidates.length} momento(s) para analisar. Preparando os resultados…`
          : "Análise do vídeo concluída. Preparando os resultados…",
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
      rememberSession(sessionId);

      await jsonRequest(`/api/recordings/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "processing_started" }),
      });

      const updatedUsedSeconds =
        reserved.quotaLimitSeconds -
        Number(reserved.quotaRemainingSeconds ?? 0);

      const updatedRemainingSeconds = Number(
        reserved.quotaRemainingSeconds ?? 0,
      );

      if (reserved.quotaSource === "trial") {
        setSources((current) =>
          current.map((source) =>
            source.entitlement.accessSource === "trial"
              ? {
                  ...source,
                  planCode: reserved.planCode,
                  quota: {
                    limitSeconds:
                      reserved.quotaLimitSeconds,
                    usedSeconds: updatedUsedSeconds,
                    remainingSeconds:
                      updatedRemainingSeconds,
                  },
                }
              : source,
          ),
        );
      } else {
        patchSource(selectedSource.id, {
          planCode: reserved.planCode,
          quota: {
            limitSeconds: reserved.quotaLimitSeconds,
            usedSeconds: updatedUsedSeconds,
            remainingSeconds:
              updatedRemainingSeconds,
          },
        });
      }

      const maximumEvents = Math.max(
        1,
        Math.ceil(scan.durationSeconds / 15),
      );
      const candidatesToSubmit = scan.candidates.slice(0, maximumEvents);

      if (scan.candidates.length > candidatesToSubmit.length) {
        setStatus(
          "Encontramos muitas mudanças no vídeo. Vamos priorizar os momentos mais relevantes.",
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
          `Analisando acontecimento · ${index + 1}/${candidatesToSubmit.length}`,
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
            : "Análise concluída. Não encontramos acontecimentos relevantes.",
        );
      } else {
        const result = await waitForSession(sessionId);
        setProgress(100);
        setStatus(
          result.failedJobs
            ? "A análise foi concluída, mas alguns momentos não puderam ser analisados."
            : "Análise concluída. Os acontecimentos já estão disponíveis no seu histórico.",
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
        setError(recordingErrorMessage(message));
        setStatus("Não foi possível concluir a análise.");
      } else {
        setStatus("Análise cancelada.");
      }
    } finally {
      setProcessing(false);
      abortRef.current = null;
    }
  }

  const entitlementReady =
    selectedSource?.entitlement.monitoringAllowed ||
    recordingConfig?.entitlement.monitoringAllowed;

  const profileReady =
    selectedSource?.profileReady ?? false;

  const recordingPhases = [
    "Gravação",
    "Ambiente",
    "Analisar",
    "Continuar",
  ] as const;

  const recordingPhaseIndex =
    sessionResult && !sessionResult.pending
      ? 3
      : profileReady
        ? 2
        : file
          ? 1
          : 0;

  return (
    <>
      <section className={onboardingStyles.firstRunCard}>
        <div
          className={onboardingStyles.firstRunProgress}
          style={{
            gridTemplateColumns:
              "repeat(4, minmax(0, 1fr))",
          }}
          aria-label="Etapas do teste com gravações"
        >
          {recordingPhases.map((item, index) => {
            const done = index < recordingPhaseIndex;
            const current =
              index === recordingPhaseIndex;

            return (
              <article
                key={item}
                data-complete={done}
                data-current={current}
              >
                <span>{done ? "✓" : index + 1}</span>
                <div>
                  <strong>{item}</strong>
                  <small>
                    {done
                      ? "Concluído"
                      : current
                        ? "Agora"
                        : "Depois"}
                  </small>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className={styles.workspace}>
      <section
        className={styles.sourcePanel}
        id="recording-environments"
      >
        <div className={styles.sectionTitle}>
          <div>
            <span>AMBIENTES</span>
            <h2>Onde foi gravado</h2>
          </div>

          <div className={styles.environmentLimit}>
            <small>
              {sources.length}/{MAX_RECORDING_ENVIRONMENTS} ambientes
            </small>

            {canManage &&
            sources.length < MAX_RECORDING_ENVIRONMENTS ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() =>
                  setNewSourceOpen((value) => !value)
                }
              >
                + Novo ambiente
              </button>
            ) : null}
          </div>
        </div>

        {newSourceOpen ? (
          <div className={styles.createSource}>
            <p className={styles.environmentHint}>
              Você pode criar até 6 ambientes. Todos compartilham
              o mesmo período e o mesmo saldo do teste de 24 horas.
            </p>

            <label>
              Nome do ambiente
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
              {sourceBusy ? "Criando…" : "Adicionar ambiente"}
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
            <strong>Adicione o primeiro ambiente</strong>
            <p>
              Dê um nome fácil de reconhecer, como Caixa, Entrada ou Estoque,
              e escolha um vídeo gravado nesse local.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.sourceHeader}>
              <div>
                <span>AMBIENTE</span>
                <h2>{selectedSource.name}</h2>
                <p>
                  {selectedSource.siteName} ·{" "}
                  {profileReady
                    ? "ambiente confirmado"
                    : "aguardando confirmação"}
                </p>
              </div>
              <div className={styles.quotaBox}>
                <span>
                  {selectedSource.entitlement.accessSource === "trial"
                    ? "Tempo de vídeos no teste"
                    : "Tempo disponível"}
                </span>
                <strong>
                  {selectedSource.entitlement.monitoringAllowed
                    ? formatQuota(selectedSource.quota.remainingSeconds)
                    : "—"}
                </strong>
                <small>
                  {!selectedSource.entitlement.monitoringAllowed
                    ? "inicie o teste ou escolha um plano"
                    : selectedSource.entitlement.accessSource === "trial"
                      ? "restantes no teste"
                      : "restantes neste período"}
                </small>

                {selectedSource.entitlement.accessSource ===
                  "trial" &&
                formatTrialEnd(
                  selectedSource.entitlement.periodEndsAt,
                ) ? (
                  <small>
                    Teste aberto até{" "}
                    {formatTrialEnd(
                      selectedSource.entitlement.periodEndsAt,
                    )}
                  </small>
                ) : null}
              </div>
            </div>

            <div className={styles.privacyStrip}>
              <strong>Privacidade da sua gravação</strong>
              <span>
                Seu vídeo original não é armazenado pelo MonitorIA.
              </span>
            </div>

            <section
              className={styles.fileCard}
              id="recording-file"
            >
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
                        : "confirmada durante a análise"}
                    </strong>
                  </span>
                   <span>
                    <small>Resolução</small>
                    <strong>
                      {videoInfo.width && videoInfo.height
                        ? `${videoInfo.width}×${videoInfo.height}`
                        : "identificada automaticamente"}
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
                    <span>2 · AMBIENTE</span>
                    <h3>Confirme o ambiente uma única vez</h3>
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
                        Algo importante sobre este local? <em>opcional</em>
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
                          ? "Analisando ambiente…"
                          : profileDraft
                            ? "Gerar novamente"
                            : "Analisar ambiente"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className={styles.muted}>
                    Selecione uma gravação para o MonitorIA entender este
                    ambiente antes da primeira análise.
                  </p>
                )}

                {profileDraft ? (
                  <div className={styles.profileReview}>
                    <div>
                      <span>AMBIENTE IDENTIFICADO</span>
                      <h4>Ambiente reconhecido</h4>
                      <p>
                        O MonitorIA reconheceu o local desta gravação.
                        Se a imagem acima representa o ambiente corretamente,
                        confirme para continuar.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={profileBusy || !canManage}
                      onClick={activateProfile}
                    >
                      Confirmar ambiente
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
                  O teste grátis fica disponível por 24 horas. Durante esse
                  período, você pode usar até 6 ambientes e analisar até
                  24 horas de gravações no total, em arquivos de até
                  1 hora cada.
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
                      : "Iniciar teste grátis por 24 horas"}
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
                      ? "Analisando…"
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
                {sessionResult.pending ? (
                  <div className={styles.pendingResult}>
                    <span
                      className={styles.resultSpinner}
                      aria-hidden="true"
                    />
                    <strong>Analisando seus acontecimentos…</strong>
                    <p>
                      Estamos finalizando a análise. Os resultados aparecerão
                      juntos assim que estiverem prontos.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className={styles.sectionTitle}>
                      <div>
                        <span>RESULTADOS</span>
                        <h3>
                          {sessionResult.events.length
                            ? `${sessionResult.events.length} acontecimento(s) relevante(s)`
                            : "Nenhum acontecimento relevante"}
                        </h3>
                      </div>
                      <small>Análise concluída</small>
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
                                  Período ·{" "}
                                  {formatEventPeriod(
                                    event.startedAt,
                                    event.endedAt,
                                  )}
                                </span>
                                <strong>
                                  {event.headline || event.summary}
                                </strong>
                                <p>{event.summary}</p>
                              </div>

                              <div className={styles.eventActions}>
                                <Link
                                  href={
                                    activeSessionId
                                      ? `/dashboard/events/${event.id}?recordingSource=${encodeURIComponent(
                                          selectedSource.id,
                                        )}&recordingSession=${encodeURIComponent(
                                          activeSessionId,
                                        )}`
                                      : `/dashboard/events/${event.id}`
                                  }
                                >
                                  Abrir acontecimento
                                </Link>

                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyResult}>
                        <strong>Análise concluída</strong>
                        <p>
                          Não encontramos acontecimentos relevantes nesse trecho.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </section>
            ) : null}

            {sessionResult && !sessionResult.pending ? (
              <section className={styles.nextSteps}>
                <div className={styles.sectionTitle}>
                  <div>
                    <span>4 · CONTINUAR</span>
                    <h3>O que deseja fazer agora?</h3>
                  </div>
                  <small>
                    {sources.length}/{MAX_RECORDING_ENVIRONMENTS} ambientes
                  </small>
                </div>

                <p className={styles.nextStepsIntro}>
                  Seu teste continua ativo. Você pode analisar outros
                  vídeos, adicionar ambientes, conhecer os planos ou
                  conectar suas câmeras.
                </p>

                <div className={styles.nextStepGrid}>
                  <button
                    type="button"
                    onClick={testAnotherVideo}
                  >
                    <strong>Testar outro vídeo</strong>
                    <span>
                      Use o mesmo ambiente e mantenha os resultados
                      anteriores no histórico.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={addAnotherEnvironment}
                    disabled={
                      sources.length >=
                      MAX_RECORDING_ENVIRONMENTS
                    }
                  >
                    <strong>Adicionar outro ambiente</strong>
                    <span>
                      {sources.length >=
                      MAX_RECORDING_ENVIRONMENTS
                        ? "Você já chegou ao limite de 6 ambientes."
                        : `Você está usando ${sources.length} de 6 ambientes.`}
                    </span>
                  </button>

                  <Link href="/dashboard/plans">
                    <strong>Ver planos e contratar</strong>
                    <span>
                      Escolha como deseja continuar usando o MonitorIA.
                    </span>
                  </Link>

                  <Link href="/dashboard/installer">
                    <strong>Conectar minhas câmeras</strong>
                    <span>
                      Faça a configuração para acompanhamento contínuo.
                    </span>
                  </Link>
                </div>

                {selectedSource.entitlement.accessSource ===
                "trial" ? (
                  <div className={styles.trialSummary}>
                    <span>
                      <strong>
                        {formatQuota(
                          selectedSource.quota.usedSeconds,
                        )}
                      </strong>
                      de 24 h de vídeos utilizados
                    </span>

                    <span>
                      <strong>
                        {formatQuota(
                          selectedSource.quota.remainingSeconds,
                        )}
                      </strong>
                      restantes
                    </span>

                    {formatTrialEnd(
                      selectedSource.entitlement.periodEndsAt,
                    ) ? (
                      <span>
                        Teste disponível até{" "}
                        <strong>
                          {formatTrialEnd(
                            selectedSource.entitlement.periodEndsAt,
                          )}
                        </strong>
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        )}
      </section>
      </div>
    </>
  );
}

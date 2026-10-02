export type DiscoveryReviewKind =
  | "new_camera"
  | "already_registered"
  | "linked_other_site"
  | "possible_duplicate"
  | "offline_unavailable";

export type DiscoverySignal = {
  name?: string | null;
  vendor?: string | null;
  model?: string | null;
};

export type DiscoveryCameraMapping = {
  agentId: string;
  agentSiteId: string | null;
  agentName: string | null;
  agentStatus: string | null;
  enabled: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type DiscoveryInventoryCamera = {
  id: string;
  siteId: string;
  siteName: string;
  name: string;
  description?: string | null;
  status?: string | null;
  pairingStatus?: string | null;
  sourceKind?: string | null;
  createdAt?: string | null;
  lastSeenAt?: string | null;
  setupNamedAt?: string | null;
  mappings: DiscoveryCameraMapping[];
};

export type DiscoveryReviewDevice = DiscoverySignal & {
  host: string;
  connected: boolean;
  failureMessage?: string | null;
};

export type DiscoveryReviewItem = {
  key: string;
  kind: DiscoveryReviewKind;
  title: string;
  detail: string;
  quantity: number;
  cameraId: string | null;
  siteId: string | null;
  siteName: string | null;
  confidence: "certain" | "probable";
};

export type DiscoveryReview = {
  counts: Record<DiscoveryReviewKind, number>;
  items: DiscoveryReviewItem[];
  hasConflicts: boolean;
};

export const STRONG_DISCOVERY_MATCH_SCORE = 68;
const STRONG_DISCOVERY_MATCH_GAP = 12;

const GENERIC_WORDS = new Set([
  "camera",
  "cam",
  "ip",
  "dvr",
  "nvr",
  "gravador",
  "canal",
  "channel",
  "onvif",
  "rtsp",
  "monitoria",
  "agent",
  "automaticamente",
]);

function dateMs(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeDiscoveryText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulWords(value: string | null | undefined) {
  return normalizeDiscoveryText(value)
    .split(" ")
    .filter((word) => word.length >= 2 && !GENERIC_WORDS.has(word));
}

function includesPhrase(haystack: string, needle: string) {
  if (!needle || needle.length < 3) return false;
  return ` ${haystack} `.includes(` ${needle} `) || haystack.includes(needle);
}

function overlapScore(left: string[], right: string[]) {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  const matches = left.filter((word) => rightSet.has(word)).length;
  return matches / Math.max(left.length, right.length);
}

export function discoveryCameraMatchScore(
  camera: DiscoveryInventoryCamera,
  signal: DiscoverySignal,
) {
  const cameraName = normalizeDiscoveryText(camera.name);
  const description = normalizeDiscoveryText(camera.description);
  const haystack = `${cameraName} ${description}`.trim();
  const signalName = normalizeDiscoveryText(signal.name);
  const vendor = normalizeDiscoveryText(signal.vendor);
  const model = normalizeDiscoveryText(signal.model);

  let score = 0;

  const signalNameWords = meaningfulWords(signal.name);
  const cameraNameWords = meaningfulWords(camera.name);
  const exactName =
    Boolean(signalName) &&
    signalName === cameraName &&
    signalNameWords.length > 0;
  const overlap = overlapScore(signalNameWords, cameraNameWords);
  const nameEvidence = exactName || overlap >= 0.5;

  if (exactName) {
    score += 46;
  } else {
    score += Math.round(overlap * 30);
  }

  if (vendor && meaningfulWords(signal.vendor).length && includesPhrase(haystack, vendor)) {
    score += 22;
  }

  if (model && meaningfulWords(signal.model).length && includesPhrase(haystack, model)) {
    score += 48;
  }

  // Fabricante + modelo não identificam uma câmera física: empresas podem
  // comprar dezenas de unidades iguais. Para virar match "forte", também
  // exigimos evidência de nome. Sem isso, o resultado continua útil para
  // revisão visual, mas nunca autoriza bloqueio/reassociação por semelhança.
  if (!nameEvidence) return Math.min(score, 60);

  return Math.min(score, 100);
}

export function rankDiscoveryCameraMatches(
  cameras: DiscoveryInventoryCamera[],
  signal: DiscoverySignal,
) {
  return cameras
    .map((camera) => ({
      camera,
      score: discoveryCameraMatchScore(camera, signal),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return dateMs(left.camera.createdAt) - dateMs(right.camera.createdAt);
    });
}

export function findUniqueStrongDiscoveryMatch(
  cameras: DiscoveryInventoryCamera[],
  signal: DiscoverySignal,
) {
  const ranked = rankDiscoveryCameraMatches(cameras, signal);
  const first = ranked[0];
  if (!first || first.score < STRONG_DISCOVERY_MATCH_SCORE) return null;

  const second = ranked[1];
  if (
    second &&
    second.score >= STRONG_DISCOVERY_MATCH_SCORE &&
    first.score - second.score < STRONG_DISCOVERY_MATCH_GAP
  ) {
    return null;
  }

  return first;
}

export function mappingIsOperational(mapping: DiscoveryCameraMapping) {
  return mapping.enabled && mapping.agentStatus !== "disabled";
}

export function chooseReusableDiscoveryCamera(
  cameras: DiscoveryInventoryCamera[],
  signal: DiscoverySignal,
) {
  const reusable = cameras.filter((camera) => {
    if (camera.status === "disabled") return false;
    if (camera.sourceKind === "local_recording") return false;
    return !camera.mappings.some(mappingIsOperational);
  });

  if (!reusable.length) return null;

  const strong = findUniqueStrongDiscoveryMatch(reusable, signal);
  if (strong) return strong.camera;

  const pairingPriority = (value: string | null | undefined) =>
    value === "unpaired" || value === "pairing" ? 0 : 1;

  return [...reusable].sort((left, right) => {
    const pairing = pairingPriority(left.pairingStatus) - pairingPriority(right.pairingStatus);
    if (pairing !== 0) return pairing;

    const setup = Number(Boolean(left.setupNamedAt)) - Number(Boolean(right.setupNamedAt));
    if (setup !== 0) return setup;

    return dateMs(left.createdAt) - dateMs(right.createdAt);
  })[0] ?? null;
}

function reviewCounts(): Record<DiscoveryReviewKind, number> {
  return {
    new_camera: 0,
    already_registered: 0,
    linked_other_site: 0,
    possible_duplicate: 0,
    offline_unavailable: 0,
  };
}

function withinRun(
  value: string | null | undefined,
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined,
) {
  const timestamp = dateMs(value);
  const started = dateMs(startedAt);
  const finished = dateMs(finishedAt) || Date.now();
  if (!timestamp || !started) return false;
  return timestamp >= started - 30_000 && timestamp <= finished + 90_000;
}

function pushReviewItem(
  items: DiscoveryReviewItem[],
  counts: Record<DiscoveryReviewKind, number>,
  item: DiscoveryReviewItem,
) {
  items.push(item);
  counts[item.kind] += item.quantity;
}

export function buildDiscoveryReview(input: {
  runAgentId: string;
  runSiteId: string;
  startedAt: string | null;
  finishedAt: string | null;
  alreadyConnected: number;
  cameras: DiscoveryInventoryCamera[];
  devices: DiscoveryReviewDevice[];
}): DiscoveryReview {
  const counts = reviewCounts();
  const items: DiscoveryReviewItem[] = [];
  const reviewedCameraIds = new Set<string>();

  for (const camera of input.cameras) {
    const runMapping = camera.mappings.find(
      (mapping) =>
        mapping.agentId === input.runAgentId &&
        mapping.enabled &&
        withinRun(
          mapping.updatedAt ?? mapping.createdAt,
          input.startedAt,
          input.finishedAt,
        ),
    );

    if (!runMapping) continue;

    const createdDuringRun = withinRun(
      camera.createdAt,
      input.startedAt,
      input.finishedAt,
    );
    const kind: DiscoveryReviewKind = createdDuringRun
      ? "new_camera"
      : "already_registered";

    pushReviewItem(items, counts, {
      key: `camera:${camera.id}`,
      kind,
      title: camera.name,
      detail: createdDuringRun
        ? `Nova câmera cadastrada em ${camera.siteName}.`
        : `Câmera já existente reaproveitada em ${camera.siteName}; histórico e configuração foram preservados.`,
      quantity: 1,
      cameraId: camera.id,
      siteId: camera.siteId,
      siteName: camera.siteName,
      confidence: "certain",
    });
    reviewedCameraIds.add(camera.id);
  }

  if (input.alreadyConnected > 0) {
    pushReviewItem(items, counts, {
      key: "already-connected",
      kind: "already_registered",
      title:
        input.alreadyConnected === 1
          ? "1 câmera já estava cadastrada"
          : `${input.alreadyConnected} câmeras já estavam cadastradas`,
      detail:
        "O Agent reconheceu a configuração local existente e não criou outra cópia.",
      quantity: input.alreadyConnected,
      cameraId: null,
      siteId: input.runSiteId,
      siteName: null,
      confidence: "certain",
    });
  }

  for (const device of input.devices) {
    if (device.connected) continue;

    const candidates = input.cameras.filter(
      (camera) => !reviewedCameraIds.has(camera.id),
    );
    const strong = findUniqueStrongDiscoveryMatch(candidates, device);

    if (strong && strong.camera.siteId !== input.runSiteId) {
      pushReviewItem(items, counts, {
        key: `device:${device.host}:other-site`,
        kind: "linked_other_site",
        title: device.name || [device.vendor, device.model].filter(Boolean).join(" ") || `Aparelho ${device.host}`,
        detail: `Há uma correspondência provável com “${strong.camera.name}” em ${strong.camera.siteName}. Nada foi movido automaticamente.`,
        quantity: 1,
        cameraId: strong.camera.id,
        siteId: strong.camera.siteId,
        siteName: strong.camera.siteName,
        confidence: "probable",
      });
      continue;
    }

    if (strong && strong.camera.siteId === input.runSiteId) {
      const mappedToCurrentAgent = strong.camera.mappings.some(
        (mapping) =>
          mapping.agentId === input.runAgentId && mappingIsOperational(mapping),
      );

      if (mappedToCurrentAgent) {
        pushReviewItem(items, counts, {
          key: `device:${device.host}:unavailable`,
          kind: "offline_unavailable",
          title: strong.camera.name,
          detail:
            device.failureMessage ||
            "A câmera já está cadastrada neste Local, mas a busca não conseguiu validar a imagem agora.",
          quantity: 1,
          cameraId: strong.camera.id,
          siteId: strong.camera.siteId,
          siteName: strong.camera.siteName,
          confidence: "probable",
        });
      } else {
        pushReviewItem(items, counts, {
          key: `device:${device.host}:duplicate`,
          kind: "possible_duplicate",
          title: device.name || strong.camera.name,
          detail: `Pode ser a mesma câmera de “${strong.camera.name}” em ${strong.camera.siteName}. O MonitorIA não apagou nem substituiu nenhum registro.`,
          quantity: 1,
          cameraId: strong.camera.id,
          siteId: strong.camera.siteId,
          siteName: strong.camera.siteName,
          confidence: "probable",
        });
      }
      continue;
    }

    pushReviewItem(items, counts, {
      key: `device:${device.host}:unavailable`,
      kind: "offline_unavailable",
      title:
        device.name ||
        [device.vendor, device.model].filter(Boolean).join(" ") ||
        `Aparelho ${device.host}`,
      detail:
        device.failureMessage ||
        "Encontrado na rede, mas sem imagem validada nesta busca.",
      quantity: 1,
      cameraId: null,
      siteId: input.runSiteId,
      siteName: null,
      confidence: "certain",
    });
  }

  return {
    counts,
    items,
    hasConflicts:
      counts.linked_other_site > 0 || counts.possible_duplicate > 0,
  };
}

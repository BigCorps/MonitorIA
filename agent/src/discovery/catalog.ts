import { VALIDATION_PRIORITY, type Credentials, type RtspCandidate } from "./types.js";

/**
 * Catálogo de caminhos RTSP.
 *
 * Cada entrada carrega um nível de confiança explícito. O nível governa
 * apenas a ORDEM de tentativa e o RÓTULO exibido — nunca a aceitação. Nenhum
 * caminho daqui é usado sem passar pela validação real de stream, e é por
 * isso que o catálogo pode nascer com sete famílias sem risco: um caminho
 * errado simplesmente falha e cede a vez ao próximo.
 *
 * `hardware_validated` é reservado a modelo testado fisicamente pela equipe.
 * Não promova nada para esse nível sem o aparelho na mão.
 */

const NOVADIGITAL: RtspCandidate[] = [
  {
    vendor: "novadigital",
    deviceType: "camera",
    stream: "main",
    pathTemplate: "/stream0",
    defaultPort: 8554,
    validationLevel: "hardware_validated",
    testedModels: ["CS-CALL"],
    notes:
      "Equipamento de homologação MonitorIA. Porta 8554, fora do padrão 554 — " +
      "por isso a varredura precisa incluir 8554. Código exato da etiqueta a confirmar.",
  },
  {
    vendor: "novadigital",
    deviceType: "camera",
    stream: "sub",
    pathTemplate: "/stream1",
    defaultPort: 8554,
    validationLevel: "hardware_validated",
    testedModels: ["CS-CALL"],
    notes:
      "Confirmado no equipamento de homologação: H.264 640x360, contra HEVC " +
      "2560x1440 do /stream0. Dezesseis vezes menos pixels e codec mais " +
      "barato de decodificar, com a mesma qualidade de detecção — a " +
      "amostragem de movimento reduz tudo para 160x90 de qualquer forma.",
  },
];

const HIKVISION: RtspCandidate[] = [
  {
    vendor: "hikvision",
    deviceType: "camera",
    stream: "main",
    pathTemplate: "/Streaming/Channels/{channel}01",
    defaultPort: 554,
    validationLevel: "official_documentation",
    testedModels: [],
  },
  {
    vendor: "hikvision",
    deviceType: "camera",
    stream: "sub",
    pathTemplate: "/Streaming/Channels/{channel}02",
    defaultPort: 554,
    validationLevel: "official_documentation",
    testedModels: [],
  },
  {
    vendor: "hikvision",
    deviceType: "nvr",
    stream: "sub",
    pathTemplate: "/Streaming/Channels/{channel}02",
    defaultPort: 554,
    validationLevel: "official_documentation",
    testedModels: [],
    notes: "Canal 10 vira 1002, o que o template já produz corretamente.",
  },
];

const DAHUA: RtspCandidate[] = [
  {
    vendor: "dahua",
    deviceType: "camera",
    stream: "sub",
    pathTemplate: "/cam/realmonitor?channel={channel}&subtype=1",
    defaultPort: 554,
    validationLevel: "official_documentation",
    testedModels: [],
    notes: "Cobre Intelbras e demais equipamentos baseados em Dahua.",
  },
  {
    vendor: "dahua",
    deviceType: "camera",
    stream: "main",
    pathTemplate: "/cam/realmonitor?channel={channel}&subtype=0",
    defaultPort: 554,
    validationLevel: "official_documentation",
    testedModels: [],
  },
  {
    vendor: "dahua",
    deviceType: "dvr",
    stream: "sub",
    pathTemplate: "/cam/realmonitor?channel={channel}&subtype=1",
    defaultPort: 554,
    validationLevel: "official_documentation",
    testedModels: [],
    notes: "Linhas residenciais e Mibo nem sempre expõem RTSP. O Agent testa.",
  },
];

const AXIS: RtspCandidate[] = [
  {
    vendor: "axis",
    deviceType: "camera",
    stream: "main",
    pathTemplate: "/axis-media/media.amp",
    defaultPort: 554,
    validationLevel: "official_documentation",
    testedModels: [],
  },
  {
    vendor: "axis",
    deviceType: "camera",
    stream: "main",
    pathTemplate: "/onvif-media/media.amp",
    defaultPort: 554,
    validationLevel: "official_documentation",
    testedModels: [],
  },
];

const REOLINK: RtspCandidate[] = [
  {
    vendor: "reolink",
    deviceType: "camera",
    stream: "sub",
    pathTemplate: "/Preview_{channel2}_sub",
    defaultPort: 554,
    validationLevel: "official_documentation",
    testedModels: [],
    notes: "Alguns modelos exigem habilitar RTSP e ONVIF no painel web.",
  },
  {
    vendor: "reolink",
    deviceType: "camera",
    stream: "main",
    pathTemplate: "/Preview_{channel2}_main",
    defaultPort: 554,
    validationLevel: "official_documentation",
    testedModels: [],
  },
];

const TPLINK_VIGI: RtspCandidate[] = [
  {
    vendor: "tp-link",
    deviceType: "camera",
    stream: "sub",
    pathTemplate: "/stream2",
    defaultPort: 554,
    validationLevel: "official_documentation",
    testedModels: [],
  },
  {
    vendor: "tp-link",
    deviceType: "camera",
    stream: "main",
    pathTemplate: "/stream1",
    defaultPort: 554,
    validationLevel: "official_documentation",
    testedModels: [],
  },
];

const HANWHA: RtspCandidate[] = [
  {
    vendor: "hanwha",
    deviceType: "camera",
    stream: "sub",
    pathTemplate: "/profile2/media.smp",
    defaultPort: 554,
    validationLevel: "official_documentation",
    testedModels: [],
    notes: "O número do perfil deve vir do ONVIF sempre que possível.",
  },
  {
    vendor: "hanwha",
    deviceType: "camera",
    stream: "main",
    pathTemplate: "/profile1/media.smp",
    defaultPort: 554,
    validationLevel: "official_documentation",
    testedModels: [],
  },
];

/**
 * Genéricos. Só entram depois que ONVIF falhou, o fabricante não foi
 * reconhecido e os caminhos oficiais não funcionaram. Nunca são exibidos
 * como compatibilidade confirmada.
 */
const GENERIC: RtspCandidate[] = [
  "/stream0",
  "/stream1",
  "/stream2",
  "/live0",
  "/live1",
  "/live",
  "/video",
  "/video1",
  "/h264",
  "/h264_stream",
].map((pathTemplate) => ({
  vendor: "generic",
  deviceType: "camera" as const,
  stream: "main" as const,
  pathTemplate,
  defaultPort: 554,
  validationLevel: "heuristic_candidate" as const,
  testedModels: [],
}));

export const RTSP_CATALOG: RtspCandidate[] = [
  ...NOVADIGITAL,
  ...HIKVISION,
  ...DAHUA,
  ...AXIS,
  ...REOLINK,
  ...TPLINK_VIGI,
  ...HANWHA,
  ...GENERIC,
];

/** Portas a sondar. 8554 está aqui por causa da NovaDigital de homologação. */
export const RTSP_PORTS = [554, 8554, 10554, 88, 8080] as const;

const VENDOR_ALIASES: Array<[RegExp, string]> = [
  [/hikvision|hiwatch/i, "hikvision"],
  [/dahua|intelbras|imou|amcrest|lorex/i, "dahua"],
  [/axis/i, "axis"],
  [/reolink/i, "reolink"],
  [/tp-?link|vigi/i, "tp-link"],
  [/hanwha|wisenet|samsung techwin/i, "hanwha"],
  [/nova\s*digital|novadigital/i, "novadigital"],
];

/** Normaliza o texto vindo do ONVIF ou dos escopos para a chave do catálogo. */
export function normalizeVendor(raw: string | null | undefined): string | null {
  if (!raw) return null;

  for (const [pattern, vendor] of VENDOR_ALIASES) {
    if (pattern.test(raw)) return vendor;
  }

  return null;
}

/**
 * Candidatos ordenados para um dispositivo.
 *
 * A prioridade é: nível de confiança primeiro, substream antes do principal.
 * O substream vem antes porque o MonitorIA analisa acontecimentos, não
 * detalhe — stream mais leve é mais estável e não disputa banda com o
 * aparelho de gravação da loja.
 */
export function candidatesFor(options: {
  vendor?: string | null;
  deviceType?: "camera" | "dvr" | "nvr" | "encoder";
  includeGeneric?: boolean;
}): RtspCandidate[] {
  const vendor = normalizeVendor(options.vendor) ?? options.vendor ?? null;
  const deviceType = options.deviceType ?? "camera";

  const matches = RTSP_CATALOG.filter((candidate) => {
    if (candidate.vendor === "generic") return options.includeGeneric !== false;
    if (vendor && candidate.vendor !== vendor) return false;
    if (!vendor) return false;

    // Câmera avulsa e canal de gravador compartilham o mesmo caminho em
    // várias famílias; aceitar os dois evita descartar entrada boa.
    return candidate.deviceType === deviceType || candidate.deviceType === "camera";
  });

  return matches.sort((a, b) => {
    const byLevel =
      VALIDATION_PRIORITY[a.validationLevel] - VALIDATION_PRIORITY[b.validationLevel];
    if (byLevel !== 0) return byLevel;

    if (a.stream !== b.stream) return a.stream === "sub" ? -1 : 1;
    return 0;
  });
}

/** Expande o template e injeta credenciais com codificação percentual. */
export function buildCandidateUrl(options: {
  candidate: RtspCandidate;
  host: string;
  port?: number;
  channel?: number;
  credentials: Credentials;
}) {
  const channel = options.channel ?? 1;
  const port = options.port ?? options.candidate.defaultPort;

  const path = options.candidate.pathTemplate
    .replace(/\{channel2\}/g, String(channel).padStart(2, "0"))
    .replace(/\{channel\}/g, String(channel));

  const user = encodeURIComponent(options.credentials.username);
  const secret = encodeURIComponent(options.credentials.password);

  return `rtsp://${user}:${secret}@${options.host}:${port}${path}`;
}

/** Caminho sem credencial e sem IP, para registrar compatibilidade. */
export function normalizeForRegistry(candidate: RtspCandidate) {
  return `rtsp://{USERNAME}:{PASSWORD}@{IP}:{PORT}${candidate.pathTemplate}`;
}

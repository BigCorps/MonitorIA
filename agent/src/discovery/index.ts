import { resolveFfmpeg } from "../ffmpeg.js";
import { resolveFfprobe } from "./binaries.js";
import {
  buildCandidateUrl,
  candidatesFor,
  normalizeForRegistry,
  normalizeVendor,
  RTSP_PORTS,
} from "./catalog.js";
import {
  getDeviceInformation,
  getProfiles,
  getServices,
  getStreamUri,
  OnvifError,
  withCredentials,
} from "./onvif.js";
import { NS } from "./soap.js";
import { openRtspPorts, scanLocalNetwork } from "./scan.js";
import { validateStream } from "./validate.js";
import { probeOnvifDevices } from "./wsdiscovery.js";
import type {
  CompatibilityRecord,
  Credentials,
  DeviceInformation,
  DiscoveredDevice,
  OnvifProfile,
  StreamValidationResult,
  ValidationLevel,
} from "./types.js";

/**
 * Orquestração da descoberta, na ordem do item 7 da diretriz.
 *
 * ONVIF → caminhos oficiais → candidatos genéricos → URL manual.
 *
 * Toda URI, venha de onde vier, passa pela mesma validação. O nível de
 * confiança só decide a ordem de tentativa e o rótulo mostrado ao lojista.
 */

export type DiscoveryResult = {
  device: DiscoveredDevice;
  information: DeviceInformation | null;
  vendor: string | null;
  onvifSupported: boolean;
  streams: Array<{
    rtspUrl: string;
    /** Sem credencial e sem IP, para exibição e registro. */
    displayPath: string;
    port: number;
    stream: "main" | "sub";
    level: ValidationLevel;
    profileToken: string | null;
    validation: StreamValidationResult;
  }>;
  /** Preenchido quando nada funcionou, para a interface explicar o motivo. */
  failure: { code: string; message: string } | null;
};

type Tools = { ffmpegPath: string; ffprobePath: string };

function log(logger: ((message: string) => void) | undefined, message: string) {
  logger?.(message);
}

/**
 * Escolhe o melhor stream entre os validados.
 *
 * Ordem de preferência da diretriz: substream H.264 até 720p, depois stream
 * principal H.264, depois H.265. O MonitorIA analisa acontecimentos, não
 * detalhe — e stream leve é mais estável e não disputa banda com o gravador
 * da loja.
 */
export function rankStreams(streams: DiscoveryResult["streams"]) {
  const score = (entry: DiscoveryResult["streams"][number]) => {
    const { codec, height } = entry.validation;
    const light = (height ?? 9999) <= 720;

    if (entry.stream === "sub" && codec === "h264" && light) return 0;
    if (codec === "h264" && entry.stream === "sub") return 1;
    if (codec === "h264") return 2;
    if (codec === "h265" && entry.stream === "sub") return 3;
    if (codec === "h265") return 4;
    return 5;
  };

  return [...streams].sort((a, b) => score(a) - score(b));
}

async function resolveTools(): Promise<Tools> {
  const [ffmpegPath, ffprobePath] = await Promise.all([resolveFfmpeg(), resolveFfprobe()]);
  return { ffmpegPath, ffprobePath };
}

/** Endereços de serviço ONVIF a tentar quando o WS-Discovery não os trouxe. */
function fallbackServiceUrls(host: string) {
  return [
    `http://${host}/onvif/device_service`,
    `http://${host}:8080/onvif/device_service`,
    `http://${host}:8000/onvif/device_service`,
    `http://${host}:2020/onvif/device_service`,
  ];
}

async function readOnvif(
  device: DiscoveredDevice,
  credentials: Credentials,
  logger?: (message: string) => void,
) {
  const urls =
    device.serviceUrls.length > 0 ? device.serviceUrls : fallbackServiceUrls(device.host);

  for (const serviceUrl of urls) {
    try {
      const information = await getDeviceInformation(serviceUrl, credentials);

      let mediaUrl: string | null = null;
      let generation: "media" | "media2" = "media";

      try {
        const services = await getServices(serviceUrl, credentials);

        // Media2 primeiro: firmwares recentes só expõem essa geração.
        const media2 = services.get(NS.media2);
        const media = services.get(NS.media);

        if (media2) {
          mediaUrl = media2;
          generation = "media2";
        } else if (media) {
          mediaUrl = media;
          generation = "media";
        }
      } catch {
        // GetServices é opcional em firmwares antigos.
      }

      if (!mediaUrl) mediaUrl = serviceUrl.replace(/\/device_service$/i, "/media_service");

      let profiles: OnvifProfile[] = [];

      try {
        profiles = await getProfiles(mediaUrl, credentials, generation);
      } catch {
        if (generation === "media2") {
          generation = "media";
          profiles = await getProfiles(mediaUrl, credentials, "media").catch(() => []);
        }
      }

      return { serviceUrl, mediaUrl, generation, information, profiles };
    } catch (error) {
      if (error instanceof OnvifError && error.status === 401) {
        log(
          logger,
          `Credencial ONVIF recusada em ${device.host}. ` +
            "O usuário do ONVIF pode ser diferente do usuário do vídeo.",
        );
        return null;
      }
      // Endereço errado é esperado no fallback; tenta o próximo.
    }
  }

  return null;
}

function displayPath(rtspUrl: string) {
  try {
    const parsed = new URL(rtspUrl);
    return `rtsp://{USUARIO}:{SENHA}@{IP}:${parsed.port || 554}${parsed.pathname}${parsed.search}`;
  } catch {
    return "rtsp://{USUARIO}:{SENHA}@{IP}";
  }
}

/**
 * Descobre e valida os streams de um dispositivo.
 *
 * Para na primeira URI validada com sucesso por nível, para não abrir dezenas
 * de conexões: muitos aparelhos limitam sessões RTSP simultâneas a duas ou
 * quatro, e esgotar esse limite durante a descoberta faria o próprio
 * monitoramento falhar em seguida.
 */
export async function discoverDeviceStreams(options: {
  device: DiscoveredDevice;
  credentials: Credentials;
  channels?: number[];
  tools?: Tools;
  log?: (message: string) => void;
}): Promise<DiscoveryResult> {
  const tools = options.tools ?? (await resolveTools());
  const { device, credentials } = options;
  const logger = options.log;

  const result: DiscoveryResult = {
    device,
    information: null,
    vendor: normalizeVendor(device.vendorHint),
    onvifSupported: false,
    streams: [],
    failure: null,
  };

  // Passos 1 a 5: ONVIF é sempre o caminho preferencial.
  const onvif = await readOnvif(device, credentials, logger);

  if (onvif) {
    result.onvifSupported = true;
    result.information = onvif.information;
    result.vendor =
      normalizeVendor(onvif.information.manufacturer) ??
      normalizeVendor(onvif.information.model) ??
      result.vendor;

    // A câmera de homologação devolve estes campos em branco, não nulos.
    // Tratar string vazia como ausente evita log enganoso e impede que o
    // catálogo registre fabricante "" como se fosse informação.
    const fabricante = onvif.information.manufacturer?.trim() || null;
    const modelo = onvif.information.model?.trim() || null;

    log(
      logger,
      `ONVIF respondeu em ${device.host}: ` +
        `${fabricante ?? "fabricante não informado"} ` +
        `${modelo ?? "(modelo não informado)"} · ` +
        `${onvif.profiles.length} perfil(is).`,
    );

    for (const profile of onvif.profiles) {
      let uri: string | null = null;

      try {
        uri = await getStreamUri(onvif.mediaUrl, credentials, profile.token, onvif.generation);
      } catch (error) {
        // A versão anterior engolia esta falha com um catch vazio. Em campo,
        // a câmera de homologação respondeu GetProfiles e falhou aqui — e o
        // log não dizia por quê, o que tornou o problema não diagnosticável.
        log(
          logger,
          `GetStreamUri falhou no perfil "${profile.name}" (${onvif.generation}): ` +
            `${error instanceof Error ? error.message : "erro desconhecido"}`,
        );

        // Firmwares que anunciam Media2 mas implementam o formato antigo são
        // comuns. Vale uma tentativa na outra geração antes de desistir.
        const alternativa = onvif.generation === "media2" ? "media" : "media2";

        try {
          uri = await getStreamUri(onvif.mediaUrl, credentials, profile.token, alternativa);
          if (uri) {
            log(logger, `GetStreamUri funcionou na geração ${alternativa}.`);
          }
        } catch (segundoErro) {
          log(
            logger,
            `GetStreamUri também falhou em ${alternativa}: ` +
              `${segundoErro instanceof Error ? segundoErro.message : "erro desconhecido"}`,
          );
          continue;
        }
      }

      if (!uri) {
        log(logger, `O perfil "${profile.name}" não devolveu URI de stream.`);
        continue;
      }

      const rtspUrl = withCredentials(uri, credentials);
      const validation = await validateStream({
          ...tools,
          rtspUrl,
          credentials,
          ...(logger ? { log: logger } : {}),
        });

      let port = 554;
      try {
        port = Number(new URL(rtspUrl).port || 554);
      } catch {
        // Mantém o padrão.
      }

      result.streams.push({
        rtspUrl,
        displayPath: displayPath(rtspUrl),
        port,
        // Perfil de menor resolução é tratado como substream.
        stream: (profile.height ?? 0) > 0 && (profile.height ?? 0) <= 720 ? "sub" : "main",
        level: "onvif_discovered",
        profileToken: profile.token,
        validation,
      });

      if (validation.success) {
        log(logger, `Stream validado por ONVIF no perfil "${profile.name}".`);
      }
    }

    if (result.streams.some((entry) => entry.validation.success)) return result;
  }

  // Passos 8 a 10: caminhos oficiais da família, depois genéricos.
  const channels = options.channels ?? [1];
  const candidates = candidatesFor({ vendor: result.vendor, includeGeneric: true });

  // Sonda as portas uma única vez em vez de testar todo caminho em todas.
  const portasAbertas = await openRtspPorts(device.host);

  if (portasAbertas.length === 0) {
    result.failure = {
      code: "no_rtsp_port",
      message:
        "Nenhuma porta de vídeo respondeu neste aparelho. " +
        "Verifique se o serviço RTSP está habilitado na câmera.",
    };
    return result;
  }

  log(
    logger,
    `ONVIF não produziu stream utilizável em ${device.host}. ` +
      `Testando ${candidates.length} caminho(s) na(s) porta(s) ${portasAbertas.join(", ")}.`,
  );

  let lastFailure: StreamValidationResult | null = null;

  for (const candidate of candidates) {
    for (const channel of channels) {
      // Só as portas comprovadamente abertas, com a porta padrão do
      // fabricante primeiro quando ela estiver entre elas.
      const portas = [...portasAbertas].sort((a, b) => {
        if (a === candidate.defaultPort) return -1;
        if (b === candidate.defaultPort) return 1;
        return a - b;
      });

      for (const port of portas) {
        const rtspUrl = buildCandidateUrl({
          candidate,
          host: device.host,
          port,
          channel,
          credentials,
        });

        const validation = await validateStream({
          ...tools,
          rtspUrl,
          credentials,
          ...(logger ? { log: logger } : {}),
        });

        // Credencial errada não melhora com outro caminho: aborta tudo e
        // devolve a mensagem certa em vez de mil tentativas inúteis.
        if (validation.rtspStatus === 401 || validation.rtspStatus === 403) {
          result.failure = {
            code: "unauthorized",
            message:
              validation.errorMessage ?? "Usuário ou senha da câmera incorretos.",
          };
          return result;
        }

        if (validation.success) {
          result.streams.push({
            rtspUrl,
            displayPath: normalizeForRegistry(candidate),
            port,
            stream: candidate.stream,
            level: candidate.validationLevel,
            profileToken: null,
            validation,
          });

          log(logger, `Stream validado pelo caminho ${candidate.pathTemplate}.`);
          return result;
        }

        lastFailure = validation;
      }
    }
  }

  if (result.streams.length === 0) {
    result.failure = {
      code: lastFailure?.errorCode ?? "no_stream",
      message:
        lastFailure?.errorMessage ??
        "A câmera foi encontrada, mas não conseguimos abrir o vídeo.",
    };
  }

  return result;
}

/** Passos 1 e 2: encontra dispositivos por ONVIF e, se preciso, por varredura. */
export async function discoverDevices(options?: {
  log?: (message: string) => void;
  skipScan?: boolean;
  hosts?: string[];
}): Promise<DiscoveredDevice[]> {
  const logger = options?.log;
  const byHost = new Map<string, DiscoveredDevice>();

  const probeOptions = logger ? { log: logger } : {};

  // O instalador recebe o IP informado pelo usuário. Nesse modo não fazemos
  // multicast nem varremos os outros 253 endereços da rede: a configuração
  // fica mais rápida, previsível e não toca equipamentos de terceiros.
  if (options?.hosts?.length) {
    return scanLocalNetwork({
      ...probeOptions,
      hosts: options.hosts,
    });
  }

  for (const device of await probeOnvifDevices(probeOptions)) {
    byHost.set(device.host, device);
  }

  if (byHost.size > 0 || options?.skipScan) return [...byHost.values()];

  log(
    logger,
    "Nenhum dispositivo respondeu ao ONVIF. Partindo para varredura da rede local.",
  );

  for (const device of await scanLocalNetwork(probeOptions)) {
    if (!byHost.has(device.host)) byHost.set(device.host, device);
  }

  return [...byHost.values()];
}

/** Passo 13: registro do que funcionou, para a base de compatibilidade. */
export function compatibilityRecordFrom(
  result: DiscoveryResult,
  chosen: DiscoveryResult["streams"][number],
  agentVersion: string,
): CompatibilityRecord {
  const { width, height, codec } = chosen.validation;

  return {
    vendor: result.information?.manufacturer ?? result.vendor,
    model: result.information?.model ?? null,
    firmware: result.information?.firmwareVersion ?? null,
    deviceType: "camera",
    source: chosen.level,
    rtspPort: chosen.port,
    pathTemplate: chosen.displayPath,
    streamType: chosen.stream,
    codec: codec ?? null,
    resolution: width && height ? `${width}x${height}` : null,
    onvifSupported: result.onvifSupported,
    validatedAt: new Date().toISOString(),
    agentVersion,
  };
}

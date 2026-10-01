import { resolveFfmpeg } from "../ffmpeg.js";
import { resolveFfprobe } from "./binaries.js";
import {
  buildCandidateUrl,
  candidatesFor,
  normalizeForRegistry,
  normalizeVendor,
} from "./catalog.js";
import { isLikelySameVisualStream } from "./frame-fingerprint.js";
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

const MAX_TIMEOUTS_PER_PORT = 2;

/**
 * Quantos canais consecutivos podem devolver a MESMA imagem antes de
 * considerarmos que o firmware está apenas aceitando qualquer número de
 * canal e redirecionando tudo para a mesma fonte.
 *
 * Três é conservador: ainda permite um firmware esquisito ter um alias no
 * meio da numeração, sem varrer 32/64 aliases idênticos como câmeras reais.
 */
const MAX_CONSECUTIVE_VISUAL_ALIASES = 3;

export type DiscoveryResult = {
  device: DiscoveredDevice;
  information: DeviceInformation | null;
  vendor: string | null;
  onvifSupported: boolean;
  streams: Array<{
    rtspUrl: string;
    displayPath: string;
    port: number;
    stream: "main" | "sub";
    level: ValidationLevel;
    profileToken: string | null;
    channel: number;
    sourceKey: string | null;
    validation: StreamValidationResult;
  }>;
  failure: { code: string; message: string } | null;
};

type Tools = { ffmpegPath: string; ffprobePath: string };

function log(logger: ((message: string) => void) | undefined, message: string) {
  logger?.(message);
}

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
  const [ffmpegPath, ffprobePath] = await Promise.all([
    resolveFfmpeg(),
    resolveFfprobe(),
  ]);
  return { ffmpegPath, ffprobePath };
}

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
    device.serviceUrls.length > 0
      ? device.serviceUrls
      : fallbackServiceUrls(device.host);

  for (const serviceUrl of urls) {
    try {
      const information = await getDeviceInformation(
        serviceUrl,
        credentials,
      );

      let mediaUrl: string | null = null;
      let generation: "media" | "media2" = "media";

      try {
        const services = await getServices(
          serviceUrl,
          credentials,
        );

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

      if (!mediaUrl) {
        mediaUrl = serviceUrl.replace(
          /\/device_service$/i,
          "/media_service",
        );
      }

      let profiles: OnvifProfile[] = [];

      try {
        profiles = await getProfiles(
          mediaUrl,
          credentials,
          generation,
        );
      } catch {
        if (generation === "media2") {
          generation = "media";
          profiles = await getProfiles(
            mediaUrl,
            credentials,
            "media",
          ).catch(() => []);
        }
      }

      return {
        serviceUrl,
        mediaUrl,
        generation,
        information,
        profiles,
      };
    } catch (error) {
      if (
        error instanceof OnvifError &&
        error.status === 401
      ) {
        log(
          logger,
          `Credencial ONVIF recusada em ${device.host}. ` +
            "O usuário do ONVIF pode ser diferente do usuário do vídeo.",
        );
        return null;
      }
    }
  }

  return null;
}

function displayPath(rtspUrl: string) {
  try {
    const parsed = new URL(rtspUrl);
    return (
      `rtsp://{USUARIO}:{SENHA}@{IP}:${parsed.port || 554}` +
      `${parsed.pathname}${parsed.search}`
    );
  } catch {
    return "rtsp://{USUARIO}:{SENHA}@{IP}";
  }
}

function duplicateChannelFor(
  streams: DiscoveryResult["streams"],
  validation: StreamValidationResult,
) {
  if (!validation.frameFingerprint) return null;

  for (const existing of streams) {
    if (
      !existing.validation.success ||
      existing.sourceKey !== null ||
      !existing.validation.frameFingerprint
    ) {
      continue;
    }

    if (
      isLikelySameVisualStream(
        existing.validation.frameFingerprint,
        validation.frameFingerprint,
      )
    ) {
      return existing.channel;
    }
  }

  return null;
}

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

  const onvifPorts = new Set<number>();
  const canalPorFonte = new Map<string, number>();

  const result: DiscoveryResult = {
    device,
    information: null,
    vendor: normalizeVendor(device.vendorHint),
    onvifSupported: false,
    streams: [],
    failure: null,
  };

  const onvif = await readOnvif(
    device,
    credentials,
    logger,
  );

  if (onvif) {
    result.onvifSupported = true;
    result.information = onvif.information;
    result.vendor =
      normalizeVendor(onvif.information.manufacturer) ??
      normalizeVendor(onvif.information.model) ??
      result.vendor;

    const fabricante =
      onvif.information.manufacturer?.trim() || null;
    const modelo =
      onvif.information.model?.trim() || null;

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
        uri = await getStreamUri(
          onvif.mediaUrl,
          credentials,
          profile.token,
          onvif.generation,
        );
      } catch (error) {
        log(
          logger,
          `GetStreamUri falhou no perfil "${profile.name}" (${onvif.generation}): ` +
            `${error instanceof Error ? error.message : "erro desconhecido"}`,
        );

        const alternativa =
          onvif.generation === "media2"
            ? "media"
            : "media2";

        try {
          uri = await getStreamUri(
            onvif.mediaUrl,
            credentials,
            profile.token,
            alternativa,
          );
          if (uri) {
            log(
              logger,
              `GetStreamUri funcionou na geração ${alternativa}.`,
            );
          }
        } catch (segundoErro) {
          log(
            logger,
            `GetStreamUri também falhou em ${alternativa}: ` +
              `${
                segundoErro instanceof Error
                  ? segundoErro.message
                  : "erro desconhecido"
              }`,
          );
          continue;
        }
      }

      if (!uri) {
        log(
          logger,
          `O perfil "${profile.name}" não devolveu URI de stream.`,
        );
        continue;
      }

      const rtspUrl = withCredentials(
        uri,
        credentials,
      );
      const validation = await validateStream({
        ...tools,
        rtspUrl,
        credentials,
        ...(logger ? { log: logger } : {}),
      });

      let port = 554;
      try {
        port = Number(
          new URL(rtspUrl).port || 554,
        );
      } catch {
        // Mantém padrão.
      }

      if (
        Number.isFinite(port) &&
        port > 0
      ) {
        onvifPorts.add(port);
      }

      const chave = profile.sourceToken;
      if (
        chave &&
        !canalPorFonte.has(chave)
      ) {
        canalPorFonte.set(
          chave,
          canalPorFonte.size + 1,
        );
      }

      result.streams.push({
        rtspUrl,
        displayPath: displayPath(rtspUrl),
        port,
        stream:
          (profile.height ?? 0) > 0 &&
          (profile.height ?? 0) <= 720
            ? "sub"
            : "main",
        level: "onvif_discovered",
        profileToken: profile.token,
        channel: chave
          ? canalPorFonte.get(chave) ?? 1
          : 1,
        sourceKey: chave ?? null,
        validation,
      });

      if (validation.success) {
        log(
          logger,
          `Stream validado por ONVIF no perfil "${profile.name}".`,
        );
      }
    }

    const fontesComVideo = new Set(
      result.streams
        .filter(
          (entry) =>
            entry.validation.success,
        )
        .map((entry) => entry.channel),
    );

    const fontesEsperadas = Math.max(
      canalPorFonte.size,
      1,
    );

    if (
      fontesComVideo.size > 0 &&
      fontesComVideo.size >= fontesEsperadas
    ) {
      if (canalPorFonte.size > 1) {
        log(
          logger,
          `Gravador com ${canalPorFonte.size} canal(is) de vídeo confirmado(s) por ONVIF.`,
        );
      }
      return result;
    }
  }

  const channels =
    options.channels ?? [1];
  const candidates = candidatesFor({
    vendor: result.vendor,
    includeGeneric: true,
  });

  const varridas =
    await openRtspPorts(device.host);
  const portasAbertas = [
    ...new Set([
      ...varridas,
      ...onvifPorts,
    ]),
  ];

  if (portasAbertas.length === 0) {
    result.failure = {
      code: "no_rtsp_port",
      message: result.onvifSupported
        ? "O aparelho responde ao ONVIF, mas não abriu nenhuma porta de vídeo. " +
          "Verifique se o RTSP está habilitado nas configurações dele."
        : "Nenhuma porta de vídeo respondeu neste aparelho. " +
          "Verifique se o serviço RTSP está habilitado na câmera.",
    };
    return result;
  }

  log(
    logger,
    `ONVIF não produziu stream utilizável em ${device.host}. ` +
      `Testando ${candidates.length} caminho(s) na(s) porta(s) ` +
      `${portasAbertas.join(", ")}.`,
  );

  let lastFailure: StreamValidationResult | null =
    null;
  const nonRtspPorts =
    new Set<number>();
  const timeoutsByPort =
    new Map<number, number>();

  const provar = async (
    candidate: (typeof candidates)[number],
    port: number,
    channel: number,
  ) => {
    const rtspUrl = buildCandidateUrl({
      candidate,
      host: device.host,
      port,
      channel,
      credentials,
    });

    const validation =
      await validateStream({
        ...tools,
        rtspUrl,
        credentials,
        ...(logger
          ? { log: logger }
          : {}),
      });

    return {
      rtspUrl,
      validation,
    };
  };

  let vencedor: {
    candidate: (typeof candidates)[number];
    port: number;
  } | null = null;

  busca: for (const candidate of candidates) {
    const portas = [
      ...portasAbertas,
    ].sort((a, b) => {
      if (a === candidate.defaultPort) return -1;
      if (b === candidate.defaultPort) return 1;
      return a - b;
    });

    for (const port of portas) {
      if (nonRtspPorts.has(port)) continue;
      if (
        (timeoutsByPort.get(port) ?? 0) >=
        MAX_TIMEOUTS_PER_PORT
      ) {
        continue;
      }

      const { rtspUrl, validation } =
        await provar(
          candidate,
          port,
          1,
        );

      if (
        validation.rtspStatus === 401 ||
        validation.rtspStatus === 403
      ) {
        result.failure = {
          code: "unauthorized",
          message:
            validation.errorMessage ??
            "Usuário ou senha da câmera incorretos.",
        };
        return result;
      }

      if (
        validation.rtspStatus === 0
      ) {
        nonRtspPorts.add(port);
        log(
          logger,
          `A porta ${port} não respondeu como RTSP e será ignorada.`,
        );
      }

      if (
        !validation.success &&
        validation.rtspStatus === undefined
      ) {
        const total =
          (timeoutsByPort.get(port) ?? 0) + 1;
        timeoutsByPort.set(
          port,
          total,
        );

        if (
          total >=
          MAX_TIMEOUTS_PER_PORT
        ) {
          log(
            logger,
            `A porta ${port} aceita conexão mas não entrega vídeo. ` +
              `Parando após ${total} esperas.`,
          );
        }
      }

      if (validation.success) {
        result.streams.push({
          rtspUrl,
          displayPath:
            normalizeForRegistry(candidate),
          port,
          stream: candidate.stream,
          level:
            candidate.validationLevel,
          profileToken: null,
          channel: 1,
          sourceKey: null,
          validation,
        });

        log(
          logger,
          `Stream validado pelo caminho ${candidate.pathTemplate}.`,
        );
        vencedor = {
          candidate,
          port,
        };
        break busca;
      }

      lastFailure = validation;
    }
  }

  if (
    vencedor &&
    channels.length > 1
  ) {
    const seguintes =
      channels.filter(
        (channel) => channel !== 1,
      );
    let vazios = 0;
    let aliasesVisuaisSeguidos = 0;

    for (const channel of seguintes) {
      if (vazios >= 2) {
        log(
          logger,
          `Canais encerrados em ${channel - 1}: dois vazios seguidos.`,
        );
        break;
      }

      if (
        aliasesVisuaisSeguidos >=
        MAX_CONSECUTIVE_VISUAL_ALIASES
      ) {
        log(
          logger,
          "A varredura de canais foi encerrada porque vários números " +
            "consecutivos devolveram a mesma imagem. O equipamento parece " +
            "aceitar aliases de canal em vez de fontes físicas diferentes.",
        );
        break;
      }

      const { rtspUrl, validation } =
        await provar(
          vencedor.candidate,
          vencedor.port,
          channel,
        );

      if (validation.success) {
        vazios = 0;

        const duplicateOf =
          duplicateChannelFor(
            result.streams,
            validation,
          );

        if (duplicateOf !== null) {
          aliasesVisuaisSeguidos += 1;

          log(
            logger,
            `Canal ${channel} devolveu a mesma imagem do canal ${duplicateOf}; ` +
              "tratando como alias e não como nova câmera.",
          );

          continue;
        }

        aliasesVisuaisSeguidos = 0;

        result.streams.push({
          rtspUrl,
          displayPath:
            normalizeForRegistry(
              vencedor.candidate,
            ),
          port: vencedor.port,
          stream:
            vencedor.candidate.stream,
          level:
            vencedor.candidate
              .validationLevel,
          profileToken: null,
          channel,
          sourceKey: null,
          validation,
        });

        log(
          logger,
          `Canal ${channel} validado como imagem diferente.`,
        );
      } else {
        vazios += 1;
        aliasesVisuaisSeguidos = 0;
      }
    }

    const canais = new Set(
      result.streams
        .filter(
          (entry) =>
            entry.validation.success,
        )
        .map((entry) => entry.channel),
    ).size;

    if (canais > 1) {
      log(
        logger,
        `Gravador com ${canais} canal(is) de vídeo distinto(s) encontrado(s).`,
      );
    }
  }

  if (result.streams.length === 0) {
    result.failure = {
      code:
        lastFailure?.errorCode ??
        "no_stream",
      message:
        lastFailure?.errorMessage ??
        "A câmera foi encontrada, mas não conseguimos abrir o vídeo.",
    };
  }

  return result;
}

export async function discoverDevices(options?: {
  log?: (message: string) => void;
  skipScan?: boolean;
  hosts?: string[];
}): Promise<DiscoveredDevice[]> {
  const logger = options?.log;
  const byHost =
    new Map<string, DiscoveredDevice>();

  const probeOptions = logger
    ? { log: logger }
    : {};

  if (options?.hosts?.length) {
    return scanLocalNetwork({
      ...probeOptions,
      hosts: options.hosts,
    });
  }

  for (
    const device of
    await probeOnvifDevices(
      probeOptions,
    )
  ) {
    byHost.set(
      device.host,
      device,
    );
  }

  if (options?.skipScan) {
    return [...byHost.values()];
  }

  log(
    logger,
    byHost.size > 0
      ? "Completando a descoberta ONVIF com a varredura da rede local."
      : "Nenhum dispositivo respondeu ao ONVIF. Partindo para varredura da rede local.",
  );

  for (
    const device of
    await scanLocalNetwork(
      probeOptions,
    )
  ) {
    if (!byHost.has(device.host)) {
      byHost.set(
        device.host,
        device,
      );
    }
  }

  return [...byHost.values()];
}

export function compatibilityRecordFrom(
  result: DiscoveryResult,
  chosen: DiscoveryResult["streams"][number],
  agentVersion: string,
): CompatibilityRecord {
  const {
    width,
    height,
    codec,
  } = chosen.validation;

  return {
    vendor:
      result.information?.manufacturer ??
      result.vendor,
    model:
      result.information?.model ??
      null,
    firmware:
      result.information?.firmwareVersion ??
      null,
    deviceType: "camera",
    source: chosen.level,
    rtspPort: chosen.port,
    pathTemplate: chosen.displayPath,
    streamType: chosen.stream,
    codec: codec ?? null,
    resolution:
      width && height
        ? `${width}x${height}`
        : null,
    onvifSupported:
      result.onvifSupported,
    validatedAt:
      new Date().toISOString(),
    agentVersion,
  };
}

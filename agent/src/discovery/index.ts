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
 * Esperas toleradas numa mesma porta antes de desistir dela.
 *
 * Uma porta que aceita a conexão e nunca entrega vídeo custa os tempos
 * limite do ffprobe a cada caminho testado. Com dez caminhos, isso vira
 * minutos de tela parada para o cliente.
 */
const MAX_TIMEOUTS_PER_PORT = 2;

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
    /**
     * Canal do aparelho. 1 para câmera IP, 1..N para gravador.
     *
     * Cada canal vira uma câmera no painel. Dois streams com o mesmo canal
     * são a mesma câmera em qualidades diferentes.
     */
    channel: number;
    /**
     * Identificador da fonte de vídeo, quando o ONVIF informa.
     *
     * Mais confiável que o número do canal para agrupar: é o próprio
     * aparelho dizendo quais perfis são a mesma câmera.
     */
    sourceKey: string | null;
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

  // Portas anunciadas pelo próprio ONVIF, mesmo que a varredura não as veja.
  const onvifPorts = new Set<number>();
  // Fonte de vídeo -> número do canal, na ordem em que o aparelho as lista.
  const canalPorFonte = new Map<string, number>();

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

      // A porta que o aparelho declarou vale mais que a varredura: o scan usa
      // tempo limite de 900ms e perde porta de aparelho lento. Sem isto, uma
      // câmera que fala ONVIF na 8080 e serve vídeo na 554 nunca tinha a 554
      // testada, e terminava com "não respondeu ao protocolo RTSP".
      if (Number.isFinite(port) && port > 0) onvifPorts.add(port);

      // Agrupa por fonte de vídeo. Num gravador, cada câmera ligada nele é
      // uma fonte, e o número do canal sai da ordem em que elas aparecem.
      const chave = profile.sourceToken ?? profile.token;
      if (!canalPorFonte.has(chave)) canalPorFonte.set(chave, canalPorFonte.size + 1);

      result.streams.push({
        rtspUrl,
        displayPath: displayPath(rtspUrl),
        port,
        // Perfil de menor resolução é tratado como substream.
        stream: (profile.height ?? 0) > 0 && (profile.height ?? 0) <= 720 ? "sub" : "main",
        level: "onvif_discovered",
        profileToken: profile.token,
        channel: canalPorFonte.get(chave) ?? 1,
        sourceKey: profile.sourceToken ?? null,
        validation,
      });

      if (validation.success) {
        log(logger, `Stream validado por ONVIF no perfil "${profile.name}".`);
      }
    }

    // Antes bastava um stream válido para encerrar. Num gravador isso
    // devolvia o canal 1 e descartava os outros sete. Agora só encerra
    // quando toda fonte anunciada tem pelo menos um stream funcionando.
    const fontesComVideo = new Set(
      result.streams
        .filter((entry) => entry.validation.success)
        .map((entry) => entry.channel),
    );

    if (fontesComVideo.size > 0 && fontesComVideo.size >= canalPorFonte.size) {
      if (canalPorFonte.size > 1) {
        log(
          logger,
          `Gravador com ${canalPorFonte.size} canal(is) de vídeo confirmado(s) por ONVIF.`,
        );
      }
      return result;
    }
  }

  // Passos 8 a 10: caminhos oficiais da família, depois genéricos.
  const channels = options.channels ?? [1];
  const candidates = candidatesFor({ vendor: result.vendor, includeGeneric: true });

  // Sonda as portas uma única vez em vez de testar todo caminho em todas.
  const varridas = await openRtspPorts(device.host);
  const portasAbertas = [...new Set([...varridas, ...onvifPorts])];

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
      `Testando ${candidates.length} caminho(s) na(s) porta(s) ${portasAbertas.join(", ")}.`,
  );

  let lastFailure: StreamValidationResult | null = null;
  const nonRtspPorts = new Set<number>();
  const timeoutsByPort = new Map<number, number>();

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

    const validation = await validateStream({
      ...tools,
      rtspUrl,
      credentials,
      ...(logger ? { log: logger } : {}),
    });

    return { rtspUrl, validation };
  };

  /**
   * Fase 1: achar um caminho que funcione, testando só o canal 1.
   *
   * A ordem antiga era caminho, depois canal, depois porta — o que fazia o
   * número de tentativas ser multiplicado pela quantidade de câmeras
   * informada pelo cliente, inclusive nos caminhos que nunca funcionariam.
   * Um gravador de oito canais custava oito vezes mais tempo para descobrir
   * a mesma coisa.
   */
  let vencedor: {
    candidate: (typeof candidates)[number];
    port: number;
  } | null = null;

  busca: for (const candidate of candidates) {
    const portas = [...portasAbertas].sort((a, b) => {
      if (a === candidate.defaultPort) return -1;
      if (b === candidate.defaultPort) return 1;
      return a - b;
    });

    for (const port of portas) {
      if (nonRtspPorts.has(port)) continue;
      if ((timeoutsByPort.get(port) ?? 0) >= MAX_TIMEOUTS_PER_PORT) continue;

      const { rtspUrl, validation } = await provar(candidate, port, 1);

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

      // Porta 80/88/8080 aberta muitas vezes é apenas o painel HTTP. Se a
      // primeira tentativa nem sequer recebeu resposta RTSP, repetir dez
      // caminhos nessa mesma porta só adiciona minutos de timeout.
      if (validation.rtspStatus === 0) {
        nonRtspPorts.add(port);
        log(logger, `A porta ${port} não respondeu como RTSP e será ignorada.`);
      }

      if (!validation.success && validation.rtspStatus === undefined) {
        const total = (timeoutsByPort.get(port) ?? 0) + 1;
        timeoutsByPort.set(port, total);

        if (total >= MAX_TIMEOUTS_PER_PORT) {
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
          displayPath: normalizeForRegistry(candidate),
          port,
          stream: candidate.stream,
          level: candidate.validationLevel,
          profileToken: null,
          channel: 1,
          sourceKey: null,
          validation,
        });

        log(logger, `Stream validado pelo caminho ${candidate.pathTemplate}.`);
        vencedor = { candidate, port };
        break busca;
      }

      lastFailure = validation;
    }
  }

  /**
   * Fase 2: com o caminho já provado, varrer os canais seguintes.
   *
   * Só aqui o número de câmeras informado pelo cliente é usado, e sobre um
   * caminho que comprovadamente responde. Um canal vazio custa uma tentativa,
   * não dez.
   */
  if (vencedor && channels.length > 1) {
    const seguintes = channels.filter((channel) => channel !== 1);
    let vazios = 0;

    for (const channel of seguintes) {
      // Gravador costuma ter canais contíguos. Duas ausências seguidas
      // significam que a numeração acabou — insistir até 64 seria gastar
      // minutos para confirmar o que já se sabe.
      if (vazios >= 2) {
        log(logger, `Canais encerrados em ${channel - 1}: dois vazios seguidos.`);
        break;
      }

      const { rtspUrl, validation } = await provar(
        vencedor.candidate,
        vencedor.port,
        channel,
      );

      if (validation.success) {
        vazios = 0;
        result.streams.push({
          rtspUrl,
          displayPath: normalizeForRegistry(vencedor.candidate),
          port: vencedor.port,
          stream: vencedor.candidate.stream,
          level: vencedor.candidate.validationLevel,
          profileToken: null,
          channel,
          sourceKey: null,
          validation,
        });

        log(logger, `Canal ${channel} validado no mesmo caminho.`);
      } else {
        vazios += 1;
      }
    }

    const canais = new Set(result.streams.map((entry) => entry.channel)).size;
    if (canais > 1) {
      log(logger, `Gravador com ${canais} canal(is) de vídeo encontrado(s).`);
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

/** Passos 1 e 2: combina ONVIF e varredura TCP para não perder câmeras. */
export async function discoverDevices(options?: {
  log?: (message: string) => void;
  skipScan?: boolean;
  hosts?: string[];
}): Promise<DiscoveredDevice[]> {
  const logger = options?.log;
  const byHost = new Map<string, DiscoveredDevice>();

  const probeOptions = logger ? { log: logger } : {};

  // O modo manual continua aceitando uma lista explícita de endereços.
  if (options?.hosts?.length) {
    return scanLocalNetwork({
      ...probeOptions,
      hosts: options.hosts,
    });
  }

  for (const device of await probeOnvifDevices(probeOptions)) {
    byHost.set(device.host, device);
  }

  if (options?.skipScan) return [...byHost.values()];

  log(
    logger,
    byHost.size > 0
      ? "Completando a descoberta ONVIF com a varredura da rede local."
      : "Nenhum dispositivo respondeu ao ONVIF. Partindo para varredura da rede local.",
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

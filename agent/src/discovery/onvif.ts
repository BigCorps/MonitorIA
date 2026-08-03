import {
  NS,
  attributeValue,
  decodeXml,
  numberOrNull,
  soapEnvelope,
  soapFault,
  tagBlocks,
  tagValue,
} from "./soap.js";
import type { Credentials, DeviceInformation, OnvifProfile } from "./types.js";

/**
 * Cliente ONVIF com as quatro operações que a descoberta precisa.
 *
 * A ordem do fluxo é a da diretriz: informações do dispositivo, perfis,
 * GetStreamUri, e só então validação real do stream. O URI devolvido aqui
 * ainda não é considerado bom — ele é candidato de nível `onvif_discovered`,
 * e passa pela mesma validação de qualquer outro.
 */

const REQUEST_TIMEOUT_MS = 10_000;

export class OnvifError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OnvifError";
  }
}

async function callSoap(
  serviceUrl: string,
  action: string,
  body: string,
  credentials: Credentials | null,
  extraNamespaces: string,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(serviceUrl, {
      method: "POST",
      headers: {
        "Content-Type": `application/soap+xml; charset=utf-8; action="${action}"`,
      },
      body: soapEnvelope({ body, credentials, extraNamespaces }),
      signal: controller.signal,
    });

    const xml = await response.text();

    if (!response.ok) {
      const fault = soapFault(xml);

      // 401 aqui quase sempre é credencial ONVIF errada, que pode ser
      // diferente da credencial RTSP no mesmo aparelho.
      throw new OnvifError(
        fault ?? `O dispositivo respondeu ${response.status}.`,
        response.status,
      );
    }

    const fault = soapFault(xml);
    if (fault) throw new OnvifError(fault, response.status);

    return xml;
  } finally {
    clearTimeout(timer);
  }
}

export async function getDeviceInformation(
  serviceUrl: string,
  credentials: Credentials,
): Promise<DeviceInformation> {
  const xml = await callSoap(
    serviceUrl,
    `${NS.device}/GetDeviceInformation`,
    `<tds:GetDeviceInformation xmlns:tds="${NS.device}"/>`,
    credentials,
    "",
  );

  return {
    manufacturer: tagValue(xml, "Manufacturer"),
    model: tagValue(xml, "Model"),
    firmwareVersion: tagValue(xml, "FirmwareVersion"),
    serialNumber: tagValue(xml, "SerialNumber"),
    hardwareId: tagValue(xml, "HardwareId"),
  };
}

/** Endpoints de serviço declarados pelo dispositivo (Media, Media2, etc). */
export async function getServices(serviceUrl: string, credentials: Credentials) {
  const xml = await callSoap(
    serviceUrl,
    `${NS.device}/GetServices`,
    `<tds:GetServices xmlns:tds="${NS.device}"><tds:IncludeCapability>false</tds:IncludeCapability></tds:GetServices>`,
    credentials,
    "",
  );

  const services = new Map<string, string>();

  for (const block of tagBlocks(xml, "Service")) {
    const namespace = tagValue(block, "Namespace");
    const address = tagValue(block, "XAddr");
    if (namespace && address) services.set(namespace, decodeXml(address));
  }

  return services;
}

function parseProfileBlock(block: string, generation: "media" | "media2"): OnvifProfile | null {
  const token = attributeValue(block, "token");
  if (!token) return null;

  const resolution = tagBlocks(block, "Resolution")[0] ?? "";

  return {
    token,
    name: tagValue(block, "Name") ?? token,
    generation,
    encoding: tagValue(block, "Encoding"),
    width: numberOrNull(tagValue(resolution, "Width")),
    height: numberOrNull(tagValue(resolution, "Height")),
    fps: numberOrNull(tagValue(block, "FrameRateLimit")),
    bitrateKbps: numberOrNull(tagValue(block, "BitrateLimit")),
  };
}

/**
 * Perfis de mídia. Tenta Media2 primeiro e cai para Media.
 *
 * Firmwares recentes expõem apenas Media2; muitos aparelhos em campo expõem
 * apenas Media. Tentar os dois evita descartar aparelho por causa da geração
 * da API.
 */
export async function getProfiles(
  mediaUrl: string,
  credentials: Credentials,
  generation: "media" | "media2",
): Promise<OnvifProfile[]> {
  const namespace = generation === "media2" ? NS.media2 : NS.media;
  const prefix = generation === "media2" ? "tr2" : "trt";

  const body =
    generation === "media2"
      ? `<tr2:GetProfiles xmlns:tr2="${namespace}"><tr2:Type>All</tr2:Type></tr2:GetProfiles>`
      : `<trt:GetProfiles xmlns:trt="${namespace}"/>`;

  const xml = await callSoap(mediaUrl, `${namespace}/GetProfiles`, body, credentials, "");
  void prefix;

  const profiles: OnvifProfile[] = [];

  for (const block of tagBlocks(xml, "Profiles")) {
    const profile = parseProfileBlock(block, generation);
    if (profile) profiles.push(profile);
  }

  return profiles;
}

export async function getStreamUri(
  mediaUrl: string,
  credentials: Credentials,
  profileToken: string,
  generation: "media" | "media2",
): Promise<string | null> {
  const namespace = generation === "media2" ? NS.media2 : NS.media;

  const body =
    generation === "media2"
      ? `<tr2:GetStreamUri xmlns:tr2="${namespace}">` +
        `<tr2:Protocol>RTSP</tr2:Protocol>` +
        `<tr2:ProfileToken>${profileToken}</tr2:ProfileToken>` +
        `</tr2:GetStreamUri>`
      : `<trt:GetStreamUri xmlns:trt="${namespace}" xmlns:tt="${NS.schema}">` +
        `<trt:StreamSetup>` +
        `<tt:Stream>RTP-Unicast</tt:Stream>` +
        `<tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport>` +
        `</trt:StreamSetup>` +
        `<trt:ProfileToken>${profileToken}</trt:ProfileToken>` +
        `</trt:GetStreamUri>`;

  const xml = await callSoap(mediaUrl, `${namespace}/GetStreamUri`, body, credentials, "");
  const uri = tagValue(xml, "Uri");

  return uri ? decodeXml(uri) : null;
}

/**
 * URI de snapshot JPEG.
 *
 * Preferível ao RTSP quando o objetivo é só uma imagem para confirmação ou
 * diagnóstico: é uma requisição HTTP, sem abrir stream nem ocupar uma das
 * conexões simultâneas que muitos aparelhos limitam a duas ou quatro.
 */
export async function getSnapshotUri(
  mediaUrl: string,
  credentials: Credentials,
  profileToken: string,
  generation: "media" | "media2",
): Promise<string | null> {
  const namespace = generation === "media2" ? NS.media2 : NS.media;

  const body =
    generation === "media2"
      ? `<tr2:GetSnapshotUri xmlns:tr2="${namespace}"><tr2:ProfileToken>${profileToken}</tr2:ProfileToken></tr2:GetSnapshotUri>`
      : `<trt:GetSnapshotUri xmlns:trt="${namespace}"><trt:ProfileToken>${profileToken}</trt:ProfileToken></trt:GetSnapshotUri>`;

  const xml = await callSoap(mediaUrl, `${namespace}/GetSnapshotUri`, body, credentials, "");
  const uri = tagValue(xml, "Uri");

  return uri ? decodeXml(uri) : null;
}

/**
 * Injeta credenciais numa URI devolvida pelo ONVIF.
 *
 * O padrão manda o aparelho devolver a URI sem usuário e senha. O FFmpeg
 * precisa delas embutidas, e a codificação percentual é obrigatória: senha
 * com @ ou / quebraria o parsing da URL silenciosamente.
 */
export function withCredentials(uri: string, credentials: Credentials) {
  try {
    const parsed = new URL(uri);
    parsed.username = encodeURIComponent(credentials.username);
    parsed.password = encodeURIComponent(credentials.password);
    return parsed.toString();
  } catch {
    return uri;
  }
}

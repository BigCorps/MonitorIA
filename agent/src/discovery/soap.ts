import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Credentials } from "./types.js";

/**
 * Camada SOAP mínima para ONVIF.
 *
 * Escrita à mão em vez de usar o pacote `onvif` do npm por três motivos: ele
 * traria a primeira dependência de produção de um binário que roda na máquina
 * do cliente, arrasta um parser XML completo, e faz WS-Discovery com
 * addMembership — o caminho que descartamos por causa de falha conhecida do
 * runtime.
 *
 * Precisamos de quatro operações, não da especificação ONVIF inteira.
 */

export const NS = {
  soap: "http://www.w3.org/2003/05/soap-envelope",
  wsa: "http://schemas.xmlsoap.org/ws/2004/08/addressing",
  wsd: "http://schemas.xmlsoap.org/ws/2005/04/discovery",
  device: "http://www.onvif.org/ver10/device/wsdl",
  media: "http://www.onvif.org/ver10/media/wsdl",
  media2: "http://www.onvif.org/ver20/media/wsdl",
  schema: "http://www.onvif.org/ver10/schema",
  wsse: "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd",
  wsu: "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd",
} as const;

const PASSWORD_TYPE =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest";
const NONCE_ENCODING =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Cabeçalho de segurança WS-UsernameToken com senha digerida.
 *
 * O digest é sha1(nonce || created || senha), com o nonce em bytes crus e os
 * outros dois em UTF-8. A senha em claro nunca vai no envelope.
 */
export function securityHeader(credentials: Credentials) {
  const nonce = randomBytes(16);
  const created = new Date().toISOString();

  const digest = createHash("sha1")
    .update(nonce)
    .update(Buffer.from(created, "utf8"))
    .update(Buffer.from(credentials.password, "utf8"))
    .digest("base64");

  return (
    `<wsse:Security xmlns:wsse="${NS.wsse}" xmlns:wsu="${NS.wsu}">` +
    `<wsse:UsernameToken>` +
    `<wsse:Username>${escapeXml(credentials.username)}</wsse:Username>` +
    `<wsse:Password Type="${PASSWORD_TYPE}">${digest}</wsse:Password>` +
    `<wsse:Nonce EncodingType="${NONCE_ENCODING}">${nonce.toString("base64")}</wsse:Nonce>` +
    `<wsu:Created>${created}</wsu:Created>` +
    `</wsse:UsernameToken>` +
    `</wsse:Security>`
  );
}

export function soapEnvelope(options: {
  body: string;
  credentials?: Credentials | null;
  extraNamespaces?: string;
}) {
  const header = options.credentials ? securityHeader(options.credentials) : "";

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<s:Envelope xmlns:s="${NS.soap}"${options.extraNamespaces ?? ""}>` +
    `<s:Header>${header}</s:Header>` +
    `<s:Body>${options.body}</s:Body>` +
    `</s:Envelope>`
  );
}

/**
 * Extração de valores por nome local de tag, ignorando prefixo de namespace.
 *
 * Não é um parser XML de uso geral e não deve virar um. As respostas ONVIF
 * são planas e previsíveis; trazer um parser completo custaria mais do que
 * resolve. Se algum dia precisarmos navegar estrutura aninhada de verdade,
 * isto aqui é o lugar errado para insistir.
 */
export function tagValues(xml: string, localName: string): string[] {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${localName}>`,
    "gi",
  );

  const values: string[] = [];
  let match = pattern.exec(xml);

  while (match) {
    if (match[1] !== undefined) values.push(match[1].trim());
    match = pattern.exec(xml);
  }

  return values;
}

export function tagValue(xml: string, localName: string): string | null {
  return tagValues(xml, localName)[0] ?? null;
}

/** Blocos completos de um elemento, para iterar perfis e ler filhos. */
export function tagBlocks(xml: string, localName: string): string[] {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${localName}(?:\\s[^>]*)?>[\\s\\S]*?</(?:[\\w.-]+:)?${localName}>`,
    "gi",
  );

  return xml.match(pattern) ?? [];
}

/** Valor de atributo por nome, no primeiro elemento do bloco. */
export function attributeValue(xml: string, attribute: string): string | null {
  const match = new RegExp(`\\b${attribute}\\s*=\\s*"([^"]*)"`, "i").exec(xml);
  return match?.[1] ?? null;
}

export function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function numberOrNull(value: string | null) {
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function newMessageId() {
  return `uuid:${randomUUID()}`;
}

/** Falha SOAP legível, quando o dispositivo devolve s:Fault. */
export function soapFault(xml: string): string | null {
  if (!/<(?:[\w.-]+:)?Fault[\s>]/i.test(xml)) return null;

  const reason =
    tagValue(xml, "Text") ?? tagValue(xml, "faultstring") ?? "Falha SOAP no dispositivo.";

  return decodeXml(reason);
}

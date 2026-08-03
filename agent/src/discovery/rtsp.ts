import net from "node:net";
import { createHash, randomBytes } from "node:crypto";
import type { Credentials } from "./types.js";

/**
 * Cliente RTSP mínimo: OPTIONS e DESCRIBE.
 *
 * Existe por um motivo específico. O FFmpeg faz DESCRIBE internamente mas não
 * expõe o código de resposta — ele devolve um erro genérico. Sem o código,
 * duas falhas com soluções opostas ficam indistinguíveis para o lojista:
 *
 *   401  usuário ou senha errados     → conferir credencial
 *   404  caminho errado, senha certa  → tentar o próximo candidato
 *
 * Com o código, a interface diz o que fazer e a orquestração sabe se vale a
 * pena continuar tentando caminhos ou se é perda de tempo.
 */

const CONNECT_TIMEOUT_MS = 4_000;
const RESPONSE_TIMEOUT_MS = 8_000;
const USER_AGENT = "MonitorIA-Agent";

export type RtspDescribeResult = {
  status: number;
  /** Corpo SDP, quando o status for 200. */
  sdp: string | null;
  codec: "h264" | "h265" | "mjpeg" | "unknown" | null;
  width: number | null;
  height: number | null;
  latencyMs: number;
  /** true quando o servidor pediu autenticação e ela foi aceita. */
  authenticated: boolean;
};

export class RtspError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "RtspError";
  }
}

function parseAuthenticate(header: string) {
  const scheme = /^\s*(Digest|Basic)/i.exec(header)?.[1]?.toLowerCase() ?? null;

  return {
    scheme,
    realm: /realm\s*=\s*"([^"]*)"/i.exec(header)?.[1] ?? "",
    nonce: /nonce\s*=\s*"([^"]*)"/i.exec(header)?.[1] ?? "",
    opaque: /opaque\s*=\s*"([^"]*)"/i.exec(header)?.[1] ?? null,
    qop: /qop\s*=\s*"?([^",]*)"?/i.exec(header)?.[1] ?? null,
  };
}

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

function digestHeader(
  challenge: ReturnType<typeof parseAuthenticate>,
  credentials: Credentials,
  method: string,
  uri: string,
) {
  const ha1 = md5(`${credentials.username}:${challenge.realm}:${credentials.password}`);
  const ha2 = md5(`${method}:${uri}`);

  if (challenge.qop === "auth") {
    const cnonce = randomBytes(8).toString("hex");
    const nc = "00000001";
    const response = md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`);

    return (
      `Digest username="${credentials.username}", realm="${challenge.realm}", ` +
      `nonce="${challenge.nonce}", uri="${uri}", qop=auth, nc=${nc}, ` +
      `cnonce="${cnonce}", response="${response}"` +
      (challenge.opaque ? `, opaque="${challenge.opaque}"` : "")
    );
  }

  const response = md5(`${ha1}:${challenge.nonce}:${ha2}`);

  return (
    `Digest username="${credentials.username}", realm="${challenge.realm}", ` +
    `nonce="${challenge.nonce}", uri="${uri}", response="${response}"` +
    (challenge.opaque ? `, opaque="${challenge.opaque}"` : "")
  );
}

function basicHeader(credentials: Credentials) {
  const token = Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");
  return `Basic ${token}`;
}

/** Envia uma requisição e lê a resposta completa, cabeçalhos mais corpo. */
function exchange(host: string, port: number, request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let buffer = "";
    let settled = false;
    let responseTimer: NodeJS.Timeout | undefined;

    const connectTimer = setTimeout(() => {
      finish(new RtspError("Tempo esgotado ao conectar.", "ETIMEDOUT"));
    }, CONNECT_TIMEOUT_MS);

    function finish(error: Error | null, value?: string) {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      if (responseTimer) clearTimeout(responseTimer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value ?? "");
    }

    function headerComplete() {
      const separator = buffer.indexOf("\r\n\r\n");
      if (separator < 0) return false;

      const length = /content-length\s*:\s*(\d+)/i.exec(buffer.slice(0, separator))?.[1];
      if (!length) return true;

      return buffer.length >= separator + 4 + Number(length);
    }

    socket.setEncoding("utf8");

    socket.on("connect", () => {
      clearTimeout(connectTimer);
      responseTimer = setTimeout(() => {
        finish(new RtspError("O dispositivo não respondeu ao RTSP.", "ETIMEDOUT"));
      }, RESPONSE_TIMEOUT_MS);
      socket.write(request);
    });

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (headerComplete()) finish(null, buffer);
    });

    socket.on("error", (error: NodeJS.ErrnoException) => {
      finish(new RtspError(error.message, error.code ?? "EUNKNOWN"));
    });

    socket.on("close", () => {
      if (buffer.length > 0) finish(null, buffer);
      else finish(new RtspError("Conexão encerrada sem resposta.", "ECLOSED"));
    });
  });
}

function statusOf(response: string) {
  return Number.parseInt(/^RTSP\/\d\.\d\s+(\d{3})/.exec(response)?.[1] ?? "0", 10);
}

function parseSdp(response: string) {
  const separator = response.indexOf("\r\n\r\n");
  const sdp = separator >= 0 ? response.slice(separator + 4) : "";

  if (!/^m=video/m.test(sdp)) {
    return { sdp, codec: null, width: null, height: null };
  }

  const rtpmap = /a=rtpmap:\d+\s+([A-Za-z0-9-]+)/i.exec(sdp)?.[1]?.toUpperCase() ?? "";

  const codec: RtspDescribeResult["codec"] =
    rtpmap.includes("H264") || rtpmap.includes("AVC")
      ? "h264"
      : rtpmap.includes("H265") || rtpmap.includes("HEVC")
        ? "h265"
        : rtpmap.includes("JPEG")
          ? "mjpeg"
          : "unknown";

  // Nem todo aparelho anuncia resolução no SDP. Quando anuncia, costuma ser
  // via a=x-dimensions ou a=framesize. O que faltar aqui vem do ffprobe.
  const dimensions =
    /a=x-dimensions\s*:\s*(\d+)\s*,\s*(\d+)/i.exec(sdp) ??
    /a=framesize:\d+\s+(\d+)-(\d+)/i.exec(sdp);

  return {
    sdp,
    codec,
    width: dimensions?.[1] ? Number(dimensions[1]) : null,
    height: dimensions?.[2] ? Number(dimensions[2]) : null,
  };
}

/**
 * DESCRIBE com autenticação automática.
 *
 * A primeira tentativa vai sem credencial de propósito: o desafio do servidor
 * informa realm e nonce, e alguns aparelhos aceitam DESCRIBE anônimo.
 */
export async function describeStream(
  rtspUrl: string,
  credentials: Credentials,
): Promise<RtspDescribeResult> {
  const parsed = new URL(rtspUrl);
  const host = parsed.hostname;
  const port = Number(parsed.port || 554);

  // A URI do cabeçalho não leva credencial: senha em linha de requisição
  // apareceria em log de qualquer proxy ou captura no caminho.
  const target = `rtsp://${host}:${port}${parsed.pathname}${parsed.search}`;
  const startedAt = Date.now();

  const build = (authorization: string | null, cseq: number) =>
    `DESCRIBE ${target} RTSP/1.0\r\n` +
    `CSeq: ${cseq}\r\n` +
    `Accept: application/sdp\r\n` +
    `User-Agent: ${USER_AGENT}\r\n` +
    (authorization ? `Authorization: ${authorization}\r\n` : "") +
    `\r\n`;

  let response = await exchange(host, port, build(null, 1));
  let status = statusOf(response);
  let authenticated = false;

  if (status === 401) {
    const header = /www-authenticate\s*:\s*(.+)/i.exec(response)?.[1]?.trim() ?? "";
    const challenge = parseAuthenticate(header);

    const authorization =
      challenge.scheme === "basic"
        ? basicHeader(credentials)
        : digestHeader(challenge, credentials, "DESCRIBE", target);

    response = await exchange(host, port, build(authorization, 2));
    status = statusOf(response);
    authenticated = status === 200;
  }

  const latencyMs = Date.now() - startedAt;

  if (status !== 200) {
    return {
      status,
      sdp: null,
      codec: null,
      width: null,
      height: null,
      latencyMs,
      authenticated,
    };
  }

  const parsedSdp = parseSdp(response);

  return {
    status,
    sdp: parsedSdp.sdp,
    codec: parsedSdp.codec,
    width: parsedSdp.width,
    height: parsedSdp.height,
    latencyMs,
    authenticated: authenticated || true,
  };
}

/** Mensagem em português para o código RTSP, usada na interface. */
export function describeStatusMessage(status: number) {
  if (status === 200) return "Stream disponível.";
  if (status === 401) return "Usuário ou senha da câmera incorretos.";
  if (status === 403) return "O usuário informado não tem permissão para ver o vídeo.";
  if (status === 404) return "Esse caminho de stream não existe neste aparelho.";
  if (status === 453) return "A câmera atingiu o limite de conexões simultâneas.";
  if (status === 454) return "A sessão RTSP não foi encontrada.";
  if (status === 551) return "O aparelho recusou uma opção da requisição.";
  if (status === 0) return "O aparelho não respondeu ao protocolo RTSP.";
  return `O aparelho respondeu ${status} ao pedido de vídeo.`;
}

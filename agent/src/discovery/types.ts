/**
 * Tipos da descoberta de câmeras.
 *
 * Segue a diretriz DIRETRIZ-RTSP-ONVIF-MONITORIA-AGENT.md. O ponto central é
 * que `ValidationLevel` governa apenas ordem de tentativa e rótulo exibido —
 * nunca a aceitação. Nenhum caminho entra em produção sem passar pela
 * validação real de stream, independente do nível.
 */

export type ValidationLevel =
  /** Testado fisicamente pela equipe num modelo específico. */
  | "hardware_validated"
  /** Formato publicado pelo fabricante, sem homologação nossa. */
  | "official_documentation"
  /** URI devolvida pela própria câmera via ONVIF GetStreamUri. */
  | "onvif_discovered"
  /** Aprovado automaticamente durante a instalação de um cliente. */
  | "runtime_validated"
  /** Genérico, sem comprovação. Nunca exibido como compatível. */
  | "heuristic_candidate";

export type DeviceType = "camera" | "dvr" | "nvr" | "encoder";

export type StreamKind = "main" | "sub";

/** Ordem de tentativa. Menor número é tentado primeiro. */
export const VALIDATION_PRIORITY: Record<ValidationLevel, number> = {
  onvif_discovered: 0,
  hardware_validated: 1,
  runtime_validated: 2,
  official_documentation: 3,
  heuristic_candidate: 4,
};

export type RtspCandidate = {
  vendor: string;
  deviceType: DeviceType;
  stream: StreamKind;
  /** Aceita {channel}. Expandido por buildCandidateUrl. */
  pathTemplate: string;
  defaultPort: number;
  validationLevel: ValidationLevel;
  source?: string;
  testedModels: string[];
  notes?: string;
};

export type StreamValidationResult = {
  success: boolean;
  rtspStatus?: number;
  codec?: "h264" | "h265" | "mjpeg" | "unknown";
  width?: number;
  height?: number;
  fps?: number;
  bitrateKbps?: number;
  firstFrameDecoded: boolean;
  blackFrameDetected: boolean;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
};

export type OnvifProfile = {
  token: string;
  name: string;
  /** ver10 (Media) ou ver20 (Media2). */
  generation: "media" | "media2";
  encoding: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  bitrateKbps: number | null;
};

export type DeviceInformation = {
  manufacturer: string | null;
  model: string | null;
  firmwareVersion: string | null;
  serialNumber: string | null;
  hardwareId: string | null;
};

export type DiscoveredDevice = {
  /** Identificador estável derivado do endereço e do UUID do dispositivo. */
  id: string;
  host: string;
  /** Endereços de serviço ONVIF anunciados no WS-Discovery. */
  serviceUrls: string[];
  /** Escopos ONVIF: nome, hardware, localização. */
  scopes: string[];
  vendorHint: string | null;
  nameHint: string | null;
  hardwareHint: string | null;
  discoveredAt: string;
  source: "wsdiscovery" | "portscan" | "manual";
};

export type DiscoveredChannel = {
  deviceId: string;
  channelNumber: number;
  channelName?: string;
  profileToken?: string;
  streamUri?: string;
  validation?: StreamValidationResult;
};

/**
 * Registro do que efetivamente funcionou, para alimentar a base de
 * compatibilidade. A senha nunca entra aqui, e o IP também não: é endereço
 * de rede local, sem valor analítico e com custo de privacidade.
 */
export type CompatibilityRecord = {
  vendor: string | null;
  model: string | null;
  firmware: string | null;
  deviceType: DeviceType;
  source: ValidationLevel;
  rtspPort: number;
  /** Caminho normalizado, sem credencial e sem IP. */
  pathTemplate: string;
  streamType: StreamKind;
  codec: string | null;
  resolution: string | null;
  onvifSupported: boolean;
  validatedAt: string;
  agentVersion: string;
};

export type Credentials = {
  username: string;
  password: string;
};

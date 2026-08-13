#!/usr/bin/env python3
from pathlib import Path

API = Path("agent/src/api.ts")
SERVICE = Path("agent/src/service.ts")

def fail(message: str):
    print(f"ERRO: {message}")
    print("Nenhum arquivo foi alterado.")
    raise SystemExit(1)

if not API.exists() or not SERVICE.exists():
    fail("execute este script na raiz do repositório MonitorIA.")

api = API.read_text(encoding="utf-8")
service = SERVICE.read_text(encoding="utf-8")

if "export async function sendCameraHealth(" in api and "private async sampleCameraHealth(" in service:
    print("A correção do funcionamento já está aplicada.")
    raise SystemExit(0)

anchor_api = '''export async function uploadSnapshot(
  baseUrl: string,
  token: string,
  cameraId: string,
  frame: CapturedFrame,
  streamLabel?: string,
) {'''

health_function = '''export async function sendCameraHealth(
  baseUrl: string,
  token: string,
  cameraId: string,
  body: JsonObject,
) {
  return requestJson<{
    ok: true;
    ignored?: boolean;
    observationId?: string;
  }>(
    baseUrl,
    `/api/agent/cameras/${encodeURIComponent(cameraId)}/health`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    },
    30_000,
  );
}

'''

if anchor_api not in api:
    fail("não encontrei o ponto esperado em agent/src/api.ts.")
api = api.replace(anchor_api, health_function + anchor_api, 1)

old_import = '''  registerDiscoveredCamera,
  sendCameraStatus,
  sendHeartbeat,
'''
new_import = '''  registerDiscoveredCamera,
  sendCameraStatus,
  sendCameraHealth,
  sendHeartbeat,
'''
if old_import not in service:
    fail("não encontrei o bloco de imports da API em agent/src/service.ts.")
service = service.replace(old_import, new_import, 1)

old_ffmpeg_import = 'import { captureFrame, resolveFfmpeg } from "./ffmpeg.js";\n'
new_ffmpeg_import = (
    'import { captureFrame, resolveFfmpeg } from "./ffmpeg.js";\n'
    'import { captureCameraHealthSample } from "./health-metrics.js";\n'
)
if old_ffmpeg_import not in service:
    fail("não encontrei o import do FFmpeg em agent/src/service.ts.")
service = service.replace(old_ffmpeg_import, new_ffmpeg_import, 1)

old_field = '''  /** Câmeras com recuperação de endereço em curso, para não repetir. */
  private readonly recovering = new Set<string>();
  private lastHeartbeatAt: string | null = null;
'''
new_field = '''  /** Câmeras com recuperação de endereço em curso, para não repetir. */
  private readonly recovering = new Set<string>();
  /** Última amostra de funcionamento enviada por câmera. */
  private readonly lastHealthSampleAt = new Map<string, number>();
  private lastHeartbeatAt: string | null = null;
'''
if old_field not in service:
    fail("não encontrei o bloco de estado interno em agent/src/service.ts.")
service = service.replace(old_field, new_field, 1)

timer_anchor = '  // --------------------------------------------------------------- timers\n'
health_method = '''  /**
   * Mede o funcionamento visual sem usar modelo de IA.
   *
   * Captura uma amostra 160x90 em tons de cinza e calcula localmente
   * brilho, contraste, nitidez, pixels escuros/claros e assinatura da grade.
   * O backend ignora a amostra caso a inteligência esteja desativada.
   */
  private async sampleCameraHealth(camera: RemoteCamera) {
    const config = this.config;
    const token = this.token;
    const ffmpegPath = this.ffmpegPath;

    if (!config || !token || !ffmpegPath || this.unauthorized) return;

    const previous = this.lastHealthSampleAt.get(camera.id) ?? 0;
    if (Date.now() - previous < CAMERA_CHECK_INTERVAL_MS - 5_000) return;

    const local = config.cameras[camera.id];
    if (!local?.protectedRtsp) return;

    try {
      const rtspUrl = await this.vault.open(local.protectedRtsp);
      const sample = await captureCameraHealthSample({
        ffmpegPath,
        rtspUrl,
        source: previous ? "periodic" : "startup",
      });

      await sendCameraHealth(
        config.apiBaseUrl,
        token,
        camera.id,
        sample as unknown as Record<string, unknown>,
      );

      this.lastHealthSampleAt.set(camera.id, Date.now());
    } catch (error) {
      this.logger.warn(
        `Falha na amostra de funcionamento de "${camera.name}": ${errorMessage(error)}`,
      );
    }
  }

'''
if timer_anchor not in service:
    fail("não encontrei o início da seção de timers em agent/src/service.ts.")
service = service.replace(timer_anchor, health_method + timer_anchor, 1)

old_runtime_branch = '''        if (runtime?.monitor.isRunning()) {
          await sendCameraStatus(config.apiBaseUrl, token, camera.id, {
            status: "online",
            streamLabel: "stream0",
            metadata: {
              continuousMonitoring: true,
              activeProfileVersion: camera.activeProfileVersion,
              planCode: camera.plan,
              framesObserved: runtime.monitor.framesObserved(),
              calibration: runtime.monitor.calibrationSnapshot(),
            },
          });
          continue;
        }

        await this.checkCamera(
          camera,
          !config.cameras[camera.id]?.lastSnapshotUploadedAt,
        );
'''
new_runtime_branch = '''        if (runtime?.monitor.isRunning()) {
          await sendCameraStatus(config.apiBaseUrl, token, camera.id, {
            status: "online",
            streamLabel: "stream0",
            metadata: {
              continuousMonitoring: true,
              activeProfileVersion: camera.activeProfileVersion,
              planCode: camera.plan,
              framesObserved: runtime.monitor.framesObserved(),
              calibration: runtime.monitor.calibrationSnapshot(),
            },
          });
          await this.sampleCameraHealth(camera);
          continue;
        }

        await this.checkCamera(
          camera,
          !config.cameras[camera.id]?.lastSnapshotUploadedAt,
        );
        await this.sampleCameraHealth(camera);
'''
if old_runtime_branch not in service:
    fail("não encontrei o ciclo de verificação das câmeras em agent/src/service.ts.")
service = service.replace(old_runtime_branch, new_runtime_branch, 1)

old_orphan = '''      delete config.cameras[cameraId];
      this.cameraBackoff.delete(cameraId);
'''
new_orphan = '''      delete config.cameras[cameraId];
      this.cameraBackoff.delete(cameraId);
      this.lastHealthSampleAt.delete(cameraId);
'''
if old_orphan not in service:
    fail("não encontrei a limpeza de câmeras órfãs em agent/src/service.ts.")
service = service.replace(old_orphan, new_orphan, 1)

required_api = [
    "export async function sendCameraHealth(",
    "/health`",
]
required_service = [
    "sendCameraHealth,",
    "captureCameraHealthSample",
    "private readonly lastHealthSampleAt",
    "private async sampleCameraHealth(",
    "await this.sampleCameraHealth(camera);",
]

if not all(x in api for x in required_api):
    fail("validação final de agent/src/api.ts falhou.")
if not all(x in service for x in required_service):
    fail("validação final de agent/src/service.ts falhou.")

API.write_text(api, encoding="utf-8")
SERVICE.write_text(service, encoding="utf-8")

print("Correção aplicada com sucesso.")
print("Alterados:")
print("  - agent/src/api.ts")
print("  - agent/src/service.ts")
print("")
print("Agora rode:")
print("  npm run check")
print("  npm run build")

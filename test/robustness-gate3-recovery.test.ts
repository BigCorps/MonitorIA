import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveCameraRecoveryDiagnostic } from "../src/camera/recovery-diagnosis.js";

const now = Date.parse("2026-10-02T20:30:00.000Z");

const baseCamera = {
  id: "camera-1",
  name: "Entrada",
  siteId: "site-1",
  siteName: "Matriz",
  sourceKind: "live_camera" as const,
  cameraOnline: true,
  cameraPaired: true,
  imageReceived: true,
  planReady: true,
  planCode: "standard",
  profileReady: true,
  agentMapped: true,
  agentEnabled: true,
  agentOnline: true,
  agentHeartbeatRecent: true,
  monitorActive: true,
  pipelineIssue: false,
  visualHealthStatus: "healthy",
  latestAnalysisAt: "2026-10-02T20:28:00.000Z",
  latestImageAt: "2026-10-02T20:29:00.000Z",
  status: "monitoring" as const,
  label: "Monitorando",
  description: "Tudo certo",
  remainingSteps: 0,
  checklist: [],
  action: { label: "Abrir câmera", href: "/dashboard/cameras/camera-1" },
};

const telemetry = {
  cameraLastSeenAt: "2026-10-02T20:29:00.000Z",
  agentLastHeartbeatAt: "2026-10-02T20:29:00.000Z",
  monitorStartedAt: "2026-10-02T20:00:00.000Z",
  latestGapAt: null,
  latestCameraErrorCode: null,
  latestCameraErrorAt: null,
  agentQueuePending: 0,
  agentDiskFreeBytes: 40 * 1024 * 1024 * 1024,
  agentVersion: "1.0.3",
  mappedAgentName: "MonitorIA Matriz",
  mappedAgentStatus: "online",
  enabledMappingCount: 1,
};

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Gate 3 reconhece câmera saudável e expõe os três tempos operacionais", () => {
  const diagnosis = deriveCameraRecoveryDiagnostic(baseCamera, telemetry, {
    nowMs: now,
  });

  assert.equal(diagnosis.issue, "healthy");
  assert.equal(diagnosis.area, "none");
  assert.match(diagnosis.signals.find((item) => item.key === "heartbeat")?.value ?? "", /há 1 min|agora/);
  assert.match(diagnosis.signals.find((item) => item.key === "image")?.value ?? "", /há 1 min|agora/);
  assert.match(diagnosis.signals.find((item) => item.key === "analysis")?.value ?? "", /há 2 min/);
});

test("Gate 3 separa falha do Agent de falha da câmera", () => {
  const diagnosis = deriveCameraRecoveryDiagnostic(
    {
      ...baseCamera,
      cameraOnline: false,
      agentOnline: false,
      agentHeartbeatRecent: false,
      monitorActive: false,
      status: "offline",
    },
    {
      ...telemetry,
      cameraLastSeenAt: "2026-10-02T20:10:00.000Z",
      agentLastHeartbeatAt: "2026-10-02T20:10:00.000Z",
      monitorStartedAt: null,
    },
    { nowMs: now },
  );

  assert.equal(diagnosis.issue, "agent_offline");
  assert.equal(diagnosis.area, "agent");
  assert.match(diagnosis.title, /computador/i);
});

test("sessão ativa com heartbeat antigo vira inconsistência explícita", () => {
  const diagnosis = deriveCameraRecoveryDiagnostic(
    {
      ...baseCamera,
      cameraOnline: false,
      agentOnline: false,
      agentHeartbeatRecent: false,
      status: "offline",
    },
    {
      ...telemetry,
      agentLastHeartbeatAt: "2026-10-02T19:30:00.000Z",
    },
    { nowMs: now },
  );

  assert.equal(diagnosis.issue, "inconsistent_state");
  assert.ok(diagnosis.inconsistencies.some((item) => /sessão de monitoramento/i.test(item)));
});

test("erro RTSP sanitizado vira orientação em português sem expor URL", () => {
  const diagnosis = deriveCameraRecoveryDiagnostic(
    {
      ...baseCamera,
      cameraOnline: false,
      imageReceived: false,
      monitorActive: false,
      status: "connecting",
    },
    {
      ...telemetry,
      latestCameraErrorCode: "rtsp_unauthorized",
      latestCameraErrorAt: "2026-10-02T20:29:30.000Z",
      monitorStartedAt: null,
    },
    { nowMs: now },
  );

  assert.equal(diagnosis.issue, "camera_error");
  assert.equal(diagnosis.area, "camera");
  assert.match(diagnosis.title, /usuário|senha/i);
  assert.match(diagnosis.primaryAction?.href ?? "", /discovery/);
  assert.equal(diagnosis.automaticRecovery?.includes("forçar um restart"), true);
});

test("problema visual não é mascarado como falha do Agent", () => {
  const diagnosis = deriveCameraRecoveryDiagnostic(
    {
      ...baseCamera,
      pipelineIssue: true,
      visualHealthStatus: "critical",
      status: "attention_required",
    },
    telemetry,
    { nowMs: now },
  );

  assert.equal(diagnosis.issue, "visual_health");
  assert.equal(diagnosis.area, "camera");
  assert.match(diagnosis.primaryAction?.href ?? "", /camera-health/);
});

test("VIP e padrão compartilham motor mas mantêm caminhos de recuperação", () => {
  const camera = {
    ...baseCamera,
    profileReady: false,
    status: "needs_configuration" as const,
  };

  const standard = deriveCameraRecoveryDiagnostic(camera, telemetry, {
    nowMs: now,
    experience: "standard",
  });
  const vip = deriveCameraRecoveryDiagnostic(camera, telemetry, {
    nowMs: now,
    experience: "vip",
  });

  assert.equal(standard.issue, "profile_pending");
  assert.equal(vip.issue, "profile_pending");
  assert.match(standard.primaryAction?.href ?? "", /^\/dashboard\/cameras/);
  assert.match(vip.primaryAction?.href ?? "", /^\/vip\/onboarding/);
});

test("backend do Gate 3 usa somente sinais já existentes e não lê mensagem RTSP crua", async () => {
  const data = await read("src/lib/camera-recovery-data.ts");
  assert.match(data, /agent_health/);
  assert.match(data, /camera_evidence_gaps/);
  assert.match(data, /camera\.error/);
  assert.match(data, /error_code/);
  assert.doesNotMatch(data, /error_message/);
  assert.match(data, /falha de telemetria opcional não/);
});

test("padrão e VIP exibem o mesmo painel de diagnóstico assistido", async () => {
  const [standard, vip, panel] = await Promise.all([
    read("src/components/standard-camera-health.tsx"),
    read("src/components/vip-camera-health.tsx"),
    read("src/components/camera-recovery-panel.tsx"),
  ]);

  assert.match(standard, /CameraRecoveryPanel/);
  assert.match(vip, /CameraRecoveryPanel/);
  assert.match(panel, /Ver diagnóstico avançado/);
  assert.match(panel, /Recuperação assistida/);
  assert.match(panel, /Verificar novamente/);
  assert.match(panel, /não reinicia o\s*Agent/i);
});

test("backlog 1.0.4 fica documentado sem implementação no Agent", async () => {
  const backlog = await read("docs/MONITORIA-AGENT-1.0.4-BACKLOG.md");
  assert.match(backlog, /watchdog real por câmera/i);
  assert.match(backlog, /camera_monitor_self_recovered/);
  assert.match(backlog, /runtime_revision/);
  assert.match(backlog, /melhor.*FFmpeg|Diagnóstico FFmpeg/is);
  assert.match(backlog, /Não implementar neste Gate/);
});

test("falha real do monitor contínuo é separada de RTSP e plano", () => {
  const diagnosis = deriveCameraRecoveryDiagnostic(
    {
      ...baseCamera,
      monitorActive: false,
      status: "ready_to_monitor",
    },
    {
      ...telemetry,
      monitorStartedAt: null,
      latestCameraErrorCode: "continuous_monitor_failed",
      latestCameraErrorAt: "2026-10-02T20:29:00.000Z",
    },
    { nowMs: now },
  );

  assert.equal(diagnosis.issue, "monitor_pending");
  assert.equal(diagnosis.area, "monitor");
  assert.match(diagnosis.title, /monitor local/i);
  // O texto pode citar plano/perfil para dizer explicitamente que NÃO são a causa.
  // O contrato correto é impedir que o diagnóstico os apresente como pendentes.
  assert.doesNotMatch(diagnosis.summary, /plano\s+pendente|perfil\s+pendente/i);
});

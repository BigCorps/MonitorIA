import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildDiscoveryReview,
  chooseReusableDiscoveryCamera,
  findUniqueStrongDiscoveryMatch,
  type DiscoveryInventoryCamera,
} from "../src/camera/discovery-review.js";

function camera(
  input: Partial<DiscoveryInventoryCamera> & Pick<DiscoveryInventoryCamera, "id" | "siteId" | "siteName" | "name">,
): DiscoveryInventoryCamera {
  return {
    description: null,
    status: "offline",
    pairingStatus: "paired",
    sourceKind: "live_camera",
    createdAt: "2026-10-01T12:00:00.000Z",
    lastSeenAt: null,
    setupNamedAt: "2026-10-01T12:10:00.000Z",
    mappings: [],
    ...input,
  };
}

test("reaproveita câmera órfã mesmo se pairing_status ainda ficou paired", () => {
  const existing = camera({
    id: "camera-old",
    siteId: "site-a",
    siteName: "Matriz",
    name: "Entrada principal",
    description: "Encontrada automaticamente pelo Agent · Hikvision DS-2CD",
    pairingStatus: "paired",
    mappings: [
      {
        agentId: "agent-old",
        agentSiteId: "site-a",
        agentName: "PC antigo",
        agentStatus: "disabled",
        enabled: true,
      },
    ],
  });

  const selected = chooseReusableDiscoveryCamera([existing], {
    name: "Entrada principal",
    vendor: "Hikvision",
    model: "DS-2CD",
  });

  assert.equal(selected?.id, "camera-old");
});

test("não considera reutilizável câmera de Agent ainda operacional", () => {
  const existing = camera({
    id: "camera-live",
    siteId: "site-a",
    siteName: "Matriz",
    name: "Entrada",
    mappings: [
      {
        agentId: "agent-live",
        agentSiteId: "site-a",
        agentName: "PC da loja",
        agentStatus: "online",
        enabled: true,
      },
    ],
  });

  assert.equal(
    chooseReusableDiscoveryCamera([existing], {
      name: "Entrada",
      vendor: null,
      model: null,
    }),
    null,
  );
});

test("match forte precisa ser único para não confundir câmeras do mesmo modelo", () => {
  const cameras = [
    camera({
      id: "a",
      siteId: "site-a",
      siteName: "Matriz",
      name: "Corredor 1",
      description: "Encontrada automaticamente pelo Agent · Intelbras VIP 1230",
    }),
    camera({
      id: "b",
      siteId: "site-a",
      siteName: "Matriz",
      name: "Corredor 2",
      description: "Encontrada automaticamente pelo Agent · Intelbras VIP 1230",
    }),
  ];

  assert.equal(
    findUniqueStrongDiscoveryMatch(cameras, {
      name: "Câmera",
      vendor: "Intelbras",
      model: "VIP 1230",
    }),
    null,
  );
});

test("revisão distingue nova, reaproveitada, outro Local e indisponível", () => {
  const cameras: DiscoveryInventoryCamera[] = [
    camera({
      id: "new",
      siteId: "site-a",
      siteName: "Matriz",
      name: "Entrada",
      createdAt: "2026-10-02T18:00:20.000Z",
      mappings: [
        {
          agentId: "agent-new",
          agentSiteId: "site-a",
          agentName: "PC Matriz",
          agentStatus: "online",
          enabled: true,
          createdAt: "2026-10-02T18:00:21.000Z",
          updatedAt: "2026-10-02T18:00:21.000Z",
        },
      ],
    }),
    camera({
      id: "reused",
      siteId: "site-a",
      siteName: "Matriz",
      name: "Estoque",
      description: "Encontrada automaticamente pelo Agent · Hikvision X1",
      createdAt: "2026-09-01T12:00:00.000Z",
      mappings: [
        {
          agentId: "agent-new",
          agentSiteId: "site-a",
          agentName: "PC Matriz",
          agentStatus: "online",
          enabled: true,
          createdAt: "2026-10-02T18:00:25.000Z",
          updatedAt: "2026-10-02T18:00:25.000Z",
        },
      ],
    }),
    camera({
      id: "other",
      siteId: "site-b",
      siteName: "Filial",
      name: "Caixa",
      description: "Encontrada automaticamente pelo Agent · Dahua IPC-10",
      mappings: [],
    }),
  ];

  const review = buildDiscoveryReview({
    runAgentId: "agent-new",
    runSiteId: "site-a",
    startedAt: "2026-10-02T18:00:00.000Z",
    finishedAt: "2026-10-02T18:01:00.000Z",
    alreadyConnected: 1,
    cameras,
    devices: [
      {
        host: "192.168.1.30",
        name: "Caixa",
        vendor: "Dahua",
        model: "IPC-10",
        connected: false,
        failureMessage: null,
      },
      {
        host: "192.168.1.31",
        name: "Desconhecida",
        vendor: null,
        model: null,
        connected: false,
        failureMessage: "Sem imagem",
      },
    ],
  });

  assert.equal(review.counts.new_camera, 1);
  assert.equal(review.counts.already_registered, 2);
  assert.equal(review.counts.linked_other_site, 1);
  assert.equal(review.counts.offline_unavailable, 1);
  assert.equal(review.hasConflicts, true);
});

test("contrato web/backend do Gate 2 não depende de mudança no Agent", async () => {
  const [route, actions, panel] = await Promise.all([
    readFile(new URL("../app/api/agent/cameras/discovered/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/cameras/discovery/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/cameras/discovery/discovery-panel.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /chooseReusableDiscoveryCamera/);
  assert.match(route, /camera_linked_other_site/);
  assert.match(route, /camera_already_registered/);
  assert.match(route, /mapping\.agentStatus === "disabled"/);
  assert.match(actions, /buildDiscoveryReview/);
  assert.match(panel, /Nova câmera/);
  assert.match(panel, /Já cadastrada/);
  assert.match(panel, /Outro Local/);
  assert.match(panel, /Possível duplicata/);
  assert.match(panel, /Limpeza assistida/);
  assert.match(panel, /Nada foi apagado/);

  // O Gate 2 mantém a promessa do produto: credenciais e RTSP continuam locais.
  assert.doesNotMatch(route, /rtspUrl|cameraHost|password/);
});

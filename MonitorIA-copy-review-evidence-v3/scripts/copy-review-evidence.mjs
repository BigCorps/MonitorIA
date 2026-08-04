#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

for (const file of [".env.local", ".env"]) {
  const absolute = resolve(process.cwd(), file);
  if (existsSync(absolute)) {
    process.loadEnvFile(absolute);
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.",
  );
}

const authHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
};

function encodeStoragePath(path) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function responseError(response) {
  const body = await response.text();
  return `${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`;
}

const source = {
  assetId: "6451e6f5-80b7-4c58-8485-d7ce592124ba",
  bucket: "event-keyframes",
  path:
    "389ebb56-fe15-440c-8ae6-7adeae1547c2/" +
    "0a9a26c1-4c81-4596-a104-959ce305e355/" +
    "2026/07/31/802c6e38-47e3-405f-ba72-9bc109895a06/peak.jpg",
};

const target = {
  assetId: "6f3c0f41-a3ce-4f90-8c1c-000000000201",
  organizationId: "6f3c0f41-a3ce-4f90-8c1c-000000000001",
  cameraId: "6f3c0f41-a3ce-4f90-8c1c-000000000003",
  eventId: "6f3c0f41-a3ce-4f90-8c1c-000000000103",
  bucket: "event-keyframes",
  path:
    "6f3c0f41-a3ce-4f90-8c1c-000000000001/" +
    "6f3c0f41-a3ce-4f90-8c1c-000000000003/" +
    "review/2026/08/03/" +
    "6f3c0f41-a3ce-4f90-8c1c-000000000103/peak.jpg",
  capturedAt: "2026-08-03T17:31:30.000Z",
  expiresAt: "2027-08-03T17:31:30.000Z",
};

const sourceUrl =
  `${supabaseUrl}/storage/v1/object/authenticated/` +
  `${encodeURIComponent(source.bucket)}/${encodeStoragePath(source.path)}`;

console.log("1/4 — Baixando a evidência de origem...");
const downloadResponse = await fetch(sourceUrl, {
  method: "GET",
  headers: authHeaders,
});

if (!downloadResponse.ok) {
  throw new Error(`Falha ao baixar a origem: ${await responseError(downloadResponse)}`);
}

const bytes = Buffer.from(await downloadResponse.arrayBuffer());
const sha256 = createHash("sha256").update(bytes).digest("hex");
console.log(`Arquivo lido: ${bytes.byteLength} bytes.`);

const targetUrl =
  `${supabaseUrl}/storage/v1/object/` +
  `${encodeURIComponent(target.bucket)}/${encodeStoragePath(target.path)}`;

console.log("2/4 — Copiando para a pasta da organização de revisão...");
const uploadResponse = await fetch(targetUrl, {
  method: "POST",
  headers: {
    ...authHeaders,
    "Content-Type": "image/jpeg",
    "Cache-Control": "3600",
    "x-upsert": "true",
  },
  body: bytes,
});

if (!uploadResponse.ok) {
  throw new Error(`Falha no upload: ${await responseError(uploadResponse)}`);
}

console.log("3/4 — Registrando storage_assets...");
const assetPayload = {
  id: target.assetId,
  organization_id: target.organizationId,
  camera_id: target.cameraId,
  analysis_job_id: null,
  event_id: target.eventId,
  kind: "event_keyframe",
  status: "ready",
  bucket: target.bucket,
  storage_path: target.path,
  mime_type: "image/jpeg",
  byte_size: bytes.byteLength,
  width: 960,
  height: 540,
  captured_at: target.capturedAt,
  expires_at: target.expiresAt,
  deleted_at: null,
  trial_run_id: null,
  frame_label: "peak",
  retention_class: "long_term",
  retention_snapshot: {
    review_demo: true,
    source_asset_id: source.assetId,
    source_context: "Loja de Serviços",
    review_use: "OpenAI plugin review only",
    contains_detected_people: false,
    plate_reading_available: false,
  },
  content_sha256: sha256,
  promoted_from_asset_id: source.assetId,
};

const upsertUrl =
  `${supabaseUrl}/rest/v1/storage_assets?on_conflict=id`;

const upsertResponse = await fetch(upsertUrl, {
  method: "POST",
  headers: {
    ...authHeaders,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify(assetPayload),
});

if (!upsertResponse.ok) {
  await fetch(targetUrl, {
    method: "DELETE",
    headers: authHeaders,
  });
  throw new Error(
    `Falha ao registrar storage_assets; a cópia foi removida: ` +
    `${await responseError(upsertResponse)}`,
  );
}

const registeredRows = await upsertResponse.json();
const registered = Array.isArray(registeredRows)
  ? registeredRows[0]
  : registeredRows;

console.log("4/4 — Verificando o registro...");
if (!registered?.id || registered.id !== target.assetId) {
  throw new Error("O ativo foi registrado, mas a resposta de verificação é inválida.");
}

console.log("Evidência demonstrativa criada com sucesso:");
console.log(JSON.stringify({
  asset_id: registered.id,
  organization_id: registered.organization_id,
  event_id: registered.event_id,
  bucket: registered.bucket,
  storage_path: registered.storage_path,
  status: registered.status,
  byte_size: registered.byte_size,
  sha256: registered.content_sha256,
}, null, 2));

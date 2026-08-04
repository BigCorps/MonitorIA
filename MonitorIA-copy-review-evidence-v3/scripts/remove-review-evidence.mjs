#!/usr/bin/env node
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

const assetId = "6f3c0f41-a3ce-4f90-8c1c-000000000201";
const bucket = "event-keyframes";
const storagePath =
  "6f3c0f41-a3ce-4f90-8c1c-000000000001/" +
  "6f3c0f41-a3ce-4f90-8c1c-000000000003/" +
  "review/2026/08/03/" +
  "6f3c0f41-a3ce-4f90-8c1c-000000000103/peak.jpg";

const deleteRecordUrl =
  `${supabaseUrl}/rest/v1/storage_assets?id=eq.${encodeURIComponent(assetId)}`;

const recordResponse = await fetch(deleteRecordUrl, {
  method: "DELETE",
  headers: {
    ...authHeaders,
    Prefer: "return=minimal",
  },
});

if (!recordResponse.ok) {
  throw new Error(
    `Falha ao remover storage_assets: ${await responseError(recordResponse)}`,
  );
}

const objectUrl =
  `${supabaseUrl}/storage/v1/object/` +
  `${encodeURIComponent(bucket)}/${encodeStoragePath(storagePath)}`;

const objectResponse = await fetch(objectUrl, {
  method: "DELETE",
  headers: authHeaders,
});

if (!objectResponse.ok && objectResponse.status !== 404) {
  throw new Error(
    `Falha ao remover o objeto: ${await responseError(objectResponse)}`,
  );
}

console.log("Evidência demonstrativa removida.");

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

console.log(JSON.stringify({
  node: process.version,
  supabase_url_loaded: Boolean(supabaseUrl),
  service_role_loaded: Boolean(serviceRoleKey),
  service_role_length: serviceRoleKey?.length ?? 0,
}, null, 2));

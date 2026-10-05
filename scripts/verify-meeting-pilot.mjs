import { existsSync, readFileSync } from "node:fs";

function read(path) {
  if (!existsSync(path)) throw new Error(`Arquivo ausente: ${path}`);
  return readFileSync(path, "utf8");
}

const checks = [];
const check = (label, ok) => checks.push([label, Boolean(ok)]);

const child = read("src/vision/child-safety.ts");
const analyzed = read("src/contracts/analyzed-event.ts");
const prompt = read("src/vision/prompt.ts");
const provider = read("src/vision/openai-provider.ts");
const eventAnalysis = read("src/lib/event-analysis.ts");
const page = read("app/dashboard/experiments/child-safety/page.tsx");
const bridge = read("test/fixtures/meeting-rtmp-bridge/mediamtx.yml");
const installer = read("test/fixtures/meeting-rtmp-bridge/Install-MeetingRtmpBridge.ps1");

check("feature flag interno", /PROINF_CHILD_ADULT_CLASSIFICATION/.test(child));
check("schema child-adult-unknown", /ApparentAgeGroupSchema/.test(analyzed));
check("prompt com revisão humana", /child_age_group_requires_human_review/.test(prompt));
check("desabilitado força unknown", /normalizeChildSafetyOutput/.test(provider));
check("guard determinístico", /applyChildSafetyReviewGuard/.test(eventAnalysis));
check("página do piloto", /PILOTO · PROTEÇÃO DA INFÂNCIA/.test(page));
check("bridge RTSP apenas loopback", /rtspAddress:\s*127\.0\.0\.1:8554/.test(bridge));
check("listener RTMP local desabilitado", /rtmp:\s*false/.test(bridge));
check("checksum do MediaMTX", /Get-FileHash -Algorithm SHA256/.test(installer));
check("segredo protegido por DPAPI", /DataProtectionScope\]::LocalMachine/.test(installer));
check("SQL 30d é manual", existsSync("supabase/manual/meeting-pilot-30d-TEMPLATE.sql"));
check("SQL infantil é manual", existsSync("supabase/manual/meeting-child-safety-camera-TEMPLATE.sql"));

for (const [label, ok] of checks) {
  console.log(`${ok ? "[OK]" : "[FALHA]"} ${label}`);
}

if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log("\nEstrutura do piloto Meeting validada.");
console.log("Depois do upload, rode também: npm run check && npm test && npm run build");

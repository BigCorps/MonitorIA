import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const buildWorkflow = readFileSync(
  ".github/workflows/build-release-candidate-v103.yml",
  "utf8",
);
const validateWorkflow = readFileSync(
  ".github/workflows/validate-release-candidate-v103.yml",
  "utf8",
);
const handoff = readFileSync("docs/MONITORIA-1.0.3-ENTREGA-05A.md", "utf8");
const matrix = readFileSync("docs/MONITORIA-1.0.3-MATRIZ-RC.md", "utf8");
const collector = readFileSync("scripts/collect-rc-v103-evidence.ps1", "utf8");

test("RC 1.0.3 é manual e não publica release/tag", () => {
  assert.match(buildWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(buildWorkflow, /^\s*push:/m);
  assert.doesNotMatch(buildWorkflow, /softprops\/action-gh-release/i);
  assert.doesNotMatch(buildWorkflow, /contents:\s*write/i);
  assert.doesNotMatch(buildWorkflow, /refs\/tags/i);
  assert.doesNotMatch(buildWorkflow, /MONITORIA_STORE_PUBLIC_URL/);
  assert.doesNotMatch(buildWorkflow, /AGENT_RECOMMENDED_VERSION/);
});

test("RC usa somente o Core 1.0.3 e produz os quatro pacotes esperados", () => {
  assert.match(buildWorkflow, /AGENT_VERSION:\s*"1\.0\.3"/);
  assert.match(buildWorkflow, /src\/index-v103\.ts/);
  assert.doesNotMatch(buildWorkflow, /src\/index-v102\.ts/);
  assert.match(buildWorkflow, /installer\\monitoria-service-v103\.iss/);
  assert.match(buildWorkflow, /installer\\monitoria-store-v103\.iss/);
  assert.match(buildWorkflow, /MonitorIA-Setup\.exe/);
  assert.match(buildWorkflow, /MonitorIA-Store-Setup\.exe/);
  assert.match(buildWorkflow, /bun-linux-x64-baseline/);
  assert.match(buildWorkflow, /bun-linux-aarch64/);
});

test("Windows RC exige assinatura e timestamp", () => {
  assert.match(buildWorkflow, /ESIGNER_USERNAME/);
  assert.match(buildWorkflow, /ESIGNER_PASSWORD/);
  assert.match(buildWorkflow, /ESIGNER_CREDENTIAL_ID/);
  assert.match(buildWorkflow, /ESIGNER_TOTP_SECRET/);
  assert.match(buildWorkflow, /sslcom\/esigner-codesign@v1\.3\.2/);
  assert.match(buildWorkflow, /TimeStamperCertificate/);
  assert.match(buildWorkflow, /Get-AuthenticodeSignature/);
});

test("RC gera manifesto rastreável pelo mesmo commit", () => {
  assert.match(buildWorkflow, /github\.sha/);
  assert.match(buildWorkflow, /SHA256SUMS\.txt/);
  assert.match(buildWorkflow, /RELEASE-CANDIDATE\.json/);
  assert.match(buildWorkflow, /"publication": false/);
  assert.match(buildWorkflow, /"tagCreated": false/);
});

test("validação leve roda no push sem construir/publicar a RC", () => {
  assert.match(validateWorkflow, /push:/);
  assert.match(validateWorkflow, /Release Candidate Contract/);
  assert.doesNotMatch(validateWorkflow, /esigner/i);
  assert.doesNotMatch(validateWorkflow, /action-gh-release/i);
});

test("handoff e matriz mantêm as travas antes da certificação", () => {
  for (const text of [handoff, matrix]) {
    assert.match(text, /agent-v1\.0\.3/);
    assert.match(text, /MONITORIA_STORE_PUBLIC_URL/);
    assert.match(text, /Microsoft/i);
  }
  assert.match(matrix, /duas câmeras/i);
  assert.match(matrix, /reboot/i);
  assert.match(matrix, /lock\/unlock/i);
  assert.match(matrix, /upgrade/i);
  assert.match(matrix, /abertura\/fechamento/i);
});

test("coletor de evidências é somente leitura sobre a instalação", () => {
  assert.match(collector, /Get-AuthenticodeSignature/);
  assert.match(collector, /Get-FileHash/);
  assert.match(collector, /Get-Process/);
  assert.doesNotMatch(collector, /Remove-Item/i);
  assert.doesNotMatch(collector, /Stop-Service/i);
  assert.doesNotMatch(collector, /Start-Service/i);
  assert.doesNotMatch(collector, /Set-ItemProperty/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../agent/src/api.js";
import { shouldRecoverInvalidCaptureSessionV102 } from "../agent/src/v102/api.js";
import { unauthorizedPairingMessageV103 } from "../agent/src/v103/status-command.js";

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
const installer247Base = readFileSync("installer/monitoria.iss", "utf8");
const storeInstaller = readFileSync("installer/monitoria-store-v103.iss", "utf8");
const storeStartupConsent = readFileSync(
  "agent/native/store-startup-consent.c",
  "utf8",
);
const innoSigner = readFileSync("scripts/sign-inno-authenticode.ps1", "utf8");
const apiV102 = readFileSync("agent/src/v102/api.ts", "utf8");
const diskBudgetV102 = readFileSync("agent/src/v102/disk-budget.ts", "utf8");
const durablePinningV103 = readFileSync(
  "agent/src/v103/durable-pinning-retention.ts",
  "utf8",
);
const indexV103 = readFileSync("agent/src/index-v103.ts", "utf8");
const textGuardMigration = readFileSync(
  "supabase/migrations/20260829124500_generated_event_text_guard.sql",
  "utf8",
);

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


test("hosts nativos Windows são compilados em UTF-8 e bloqueiam mojibake", () => {
  const nativeCompileLines = buildWorkflow
    .split("\n")
    .filter(
      (line) =>
        /cl\.exe/.test(line) &&
        /(?:dpapi|tray|desktop-host|store-startup-consent)\.c/.test(line),
    );

  assert.equal(nativeCompileLines.length, 4);
  for (const line of nativeCompileLines) {
    assert.match(line, /\/utf-8/);
  }

  assert.match(buildWorkflow, /código de conexão/);
  assert.match(buildWorkflow, /cÃ³digo de conexÃ£o/);
  assert.match(buildWorkflow, /atenção: serviço parado/);
  assert.match(buildWorkflow, /atenÃ§Ã£o: serviÃ§o parado/);
  assert.match(buildWorkflow, /Desktop Host contém mojibake UTF-8\/ANSI/);
  assert.match(buildWorkflow, /Tray 24\/7 contém mojibake UTF-8\/ANSI/);
  assert.match(buildWorkflow, /Launcher Store contém mojibake UTF-8\/ANSI/);
  assert.match(buildWorkflow, /inicialização automática/);
  assert.match(buildWorkflow, /inicializaÃ§Ã£o automÃ¡tica/);
});

test("Inno assina Setup e uninstaller nos dois canais Windows", () => {
  for (const installer of [installer247Base, storeInstaller]) {
    assert.match(installer, /SignTool=monitoria/);
    assert.match(installer, /SignedUninstaller=yes/);
  }

  assert.match(buildWorkflow, /\/DSignCommand=1/);
  assert.match(buildWorkflow, /sign-inno-authenticode\.ps1/);
  assert.match(buildWorkflow, /monitoria-inno-signatures\.jsonl/);
  assert.match(buildWorkflow, /Uninstaller não passou pelo SignTool do Inno/);
  assert.doesNotMatch(buildWorkflow, /setup-247-signed/);
  assert.doesNotMatch(buildWorkflow, /setup-store-signed/);

  assert.match(innoSigner, /CodeSignTool\.bat/);
  assert.match(innoSigner, /Get-AuthenticodeSignature/);
  assert.match(innoSigner, /TimeStamperCertificate/);
  assert.match(innoSigner, /Copy-Item/);
  assert.match(innoSigner, /monitoria-inno-signatures\.jsonl/);

  // Inno 6 entrega o uninstaller ao SignTool como uninst.e32.tmp.
  // O wrapper deve normalizar apenas a entrada da SSL.com para .exe e
  // devolver exatamente os mesmos bytes assinados ao caminho original.
  assert.match(innoSigner, /Assert-PeImage/);
  assert.match(innoSigner, /monitoria-inno-sign\.exe/);
  assert.match(
    innoSigner,
    /Copy-Item -LiteralPath \$resolvedPath -Destination \$stagedInput -Force/,
  );
  assert.match(innoSigner, /signerInputFileName/);
  assert.match(innoSigner, /\$finalHash -ne \$signedHash/);
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

test("fila durável recupera somente sessão antiga após troca de Agent", () => {
  const staleSession = new ApiError(
    "A API retornou HTTP 400 (invalid_capture_session).",
    400,
    "invalid_capture_session",
  );
  const another400 = new ApiError(
    "A API retornou HTTP 400 (invalid_event_payload).",
    400,
    "invalid_event_payload",
  );

  assert.equal(
    shouldRecoverInvalidCaptureSessionV102(staleSession, "session-antiga"),
    true,
  );
  assert.equal(
    shouldRecoverInvalidCaptureSessionV102(staleSession, null),
    false,
  );
  assert.equal(
    shouldRecoverInvalidCaptureSessionV102(another400, "session-antiga"),
    false,
  );
  assert.match(apiV102, /captureSessionRecovery:\s*"agent_repair"/);
  assert.match(apiV102, /return submit\(null, true\)/);
});

test("status 1.0.3 orienta reparo sem recomendar reset/unpair", () => {
  const neverAuthenticated = unauthorizedPairingMessageV103(false);
  const previouslyAuthenticated = unauthorizedPairingMessageV103(true);

  for (const message of [neverAuthenticated, previouslyAuthenticated]) {
    assert.match(message, /troca\/reparo|troca ou reparo/i);
    assert.match(message, /novo código/i);
    assert.match(message, /não use reset/i);
  }

  assert.doesNotMatch(neverAuthenticated, /não token revogado/i);
  assert.match(indexV103, /runV103StatusCommand/);
});

test("guard SQL bloqueia escapes Latin-1 literais nos textos da IA", () => {
  assert.match(textGuardMigration, /normalize_monitoria_generated_text/);
  assert.match(textGuardMigration, /balce3o/);
  assert.match(textGuardMigration, /balcão/);
  assert.match(textGuardMigration, /interae7e3o/);
  assert.match(textGuardMigration, /interação/);
  assert.match(textGuardMigration, /v_previous text/);
  assert.match(textGuardMigration, /loop/);
  assert.match(textGuardMigration, /exit when v_value = v_previous/i);
  assert.match(textGuardMigration, /before insert or update of headline, summary/i);
  assert.match(textGuardMigration, /human_reviewed_at is null/i);
});


test("Store só habilita autostart depois de consentimento explícito", () => {
  assert.match(storeInstaller, /monitoria-store-launcher\.exe/);
  assert.match(storeInstaller, /--startup-settings/);
  assert.match(storeInstaller, /--remove-startup/);
  assert.match(storeInstaller, /deletevalue dontcreatekey noerror/);
  assert.doesNotMatch(
    storeInstaller,
    /ValueType:\s*string;[\s\S]*ValueName:\s*"MonitorIA";[\s\S]*ValueData:/,
  );

  assert.match(storeStartupConsent, /MB_YESNO/);
  assert.match(storeStartupConsent, /MB_DEFBUTTON2/);
  assert.match(storeStartupConsent, /A opção começa desligada/);
  assert.match(storeStartupConsent, /CurrentVersion\\\\Run/);
  assert.match(storeStartupConsent, /WriteStartupChoice/);
  assert.match(storeStartupConsent, /SetAutostartEnabled/);
  assert.match(storeStartupConsent, /ReadStartupChoice\(&saved_choice\)/);
  assert.match(storeStartupConsent, /SetAutostartEnabled\(saved_choice == 1\)/);
  assert.match(storeStartupConsent, /--startup-settings/);
  assert.match(storeStartupConsent, /--remove-startup/);

  assert.match(buildWorkflow, /monitoria-store-launcher\.exe sign-stage/);
  assert.match(buildWorkflow, /Silent install habilitou CurrentVersion\\Run sem consentimento/);
  assert.match(buildWorkflow, /\/VERYSILENT/);
  assert.match(buildWorkflow, /\/SUPPRESSMSGBOXES/);
  assert.match(buildWorkflow, /\/NORESTART/);
  assert.match(buildWorkflow, /\/SP-/);
});

test("vídeo pinado acompanha fila durável e só cede em ENOSPC extremo", () => {
  assert.match(diskBudgetV102, /persistentPinning/);
  assert.match(diskBudgetV102, /isPersistentPinningDirectoryV103/);
  assert.match(diskBudgetV102, /allowPersistentPinningEviction/);
  assert.match(diskBudgetV102, /persistentPinningEvictionsTotal/);

  assert.match(durablePinningV103, /PersistentEventQueue/);
  assert.match(durablePinningV103, /\.accepted\.json/);
  assert.match(durablePinningV103, /queuePendingHasPriority:\s*true/);
  assert.match(durablePinningV103, /7 \* 24 \* 60 \* 60_000/);

  const retentionInstall = indexV103.indexOf(
    "installV103DurablePinningRetention();",
  );
  const earlyPinningInstall = indexV103.indexOf(
    "installV103EarlyEvidencePinning();",
  );
  assert.ok(retentionInstall >= 0);
  assert.ok(earlyPinningInstall >= 0);
  assert.ok(retentionInstall < earlyPinningInstall);

  const emergency = diskBudgetV102.slice(
    diskBudgetV102.indexOf("async releaseForEventPressure()"),
  );
  assert.match(emergency, /false,\s*false/);
  assert.match(emergency, /true,\s*false/);
  assert.match(emergency, /true,\s*true/);
});

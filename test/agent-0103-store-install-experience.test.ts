import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("instalador Store é por usuário e possui abertura visível com consentimento", async () => {
  const source = await readFile(
    new URL("../installer/monitoria-store-v103.iss", import.meta.url),
    "utf8",
  );

  assert.match(source, /PrivilegesRequired=lowest/);
  assert.match(source, /DefaultDirName=\{localappdata\}\\Programs\\MonitorIA/);
  assert.match(source, /\[Icons\]/);
  assert.match(source, /\{autoprograms\}\\MonitorIA/);
  assert.match(source, /monitoria-store-launcher\.exe/);
  assert.match(source, /MonitorIA — Inicialização automática/);
  assert.match(source, /--startup-settings/);
  assert.match(source, /Root: HKCU/);
  assert.match(source, /CurrentVersion\\Run/);
  assert.match(source, /ValueType: none/);
  assert.match(source, /deletevalue dontcreatekey noerror/);
  assert.doesNotMatch(
    source,
    /ValueType:\s*string;[\s\S]{0,300}ValueName:\s*"MonitorIA";[\s\S]{0,300}ValueData:/i,
  );
});



test("Store só ativa início automático depois de escolha explícita do usuário", async () => {
  const installer = await readFile(
    new URL("../installer/monitoria-store-v103.iss", import.meta.url),
    "utf8",
  );
  const launcher = await readFile(
    new URL("../agent/native/store-startup-consent.c", import.meta.url),
    "utf8",
  );

  assert.match(installer, /monitoria-store-launcher\.exe/);
  assert.match(installer, /skipifsilent/);
  assert.match(installer, /--remove-startup/);
  assert.match(launcher, /MB_YESNO/);
  assert.match(launcher, /MB_DEFBUTTON2/);
  assert.match(launcher, /A opção começa desligada/);
  assert.match(launcher, /AutoStartChoice/);
  assert.match(launcher, /SetAutostartEnabled/);
  assert.match(launcher, /--startup-settings/);
  assert.match(launcher, /--remove-startup/);
  assert.match(launcher, /CurrentVersion\\\\Run/);
  assert.match(launcher, /ReadStartupChoice\(&saved_choice\)/);
  assert.match(launcher, /SetAutostartEnabled\(saved_choice == 1\)/);
});

test("instalação Store não depende de tela interativa para parear", async () => {
  const installer = await readFile(
    new URL("../installer/monitoria-store-v103.iss", import.meta.url),
    "utf8",
  );
  const host = await readFile(
    new URL("../agent/native/desktop-host.c", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(installer, /CreateInputQueryPage/);
  assert.doesNotMatch(installer, /PairingPage/);
  assert.match(installer, /skipifsilent/);
  assert.match(host, /Conecte este computador ao MonitorIA/);
  assert.match(host, /paired-check/);
});

test("instalador Store não empacota componentes da edição 24x7", async () => {
  const source = await readFile(
    new URL("../installer/monitoria-store-v103.iss", import.meta.url),
    "utf8",
  );

  for (const forbidden of [
    "monitoria-service.exe",
    "monitoria-service.xml",
    "OpenSCManager",
    "CreateService",
    "MonitorIAAgent",
  ]) {
    assert.equal(
      source.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `Encontrou item proibido no instalador Store: ${forbidden}`,
    );
  }
});

test("upgrade Store preserva dados até desinstalação explícita", async () => {
  const source = await readFile(
    new URL("../installer/monitoria-store-v103.iss", import.meta.url),
    "utf8",
  );

  assert.match(source, /UsePreviousAppDir=yes/);
  assert.match(source, /\[UninstallDelete\]/);
  assert.match(source, /\{localappdata\}\\MonitorIA/);
  assert.doesNotMatch(source, /PrepareToInstall.*MonitorIA\\agent\.json/s);
});

test("dashboard explica as duas edições sem prometer ausência de análise de segurança", async () => {
  const source = await readFile(
    new URL("../app/dashboard/installer/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /MonitorIA 24\/7/);
  assert.match(source, /MonitorIA via Microsoft Store/);
  assert.match(source, /Monitora antes do login/);
  assert.match(source, /Começa após o login/);
  assert.match(source, /programas de segurança ainda podem analisar/);
  assert.match(source, /não é necessário desativar a proteção/);
});

test("reparo não compete com as abas do onboarding e usa assistente próprio", async () => {
  const page = await readFile(
    new URL("../app/dashboard/installer/pair/page.tsx", import.meta.url),
    "utf8",
  );
  const flow = await readFile(
    new URL("../app/dashboard/installer/pair/repair-connection-flow.tsx", import.meta.url),
    "utf8",
  );
  const actions = await readFile(
    new URL("../app/dashboard/installer/pair/actions.ts", import.meta.url),
    "utf8",
  );
  const tabs = await readFile(
    new URL("../app/dashboard/dashboard-section-tabs.tsx", import.meta.url),
    "utf8",
  );
  const navigation = await readFile(
    new URL("../app/dashboard/dashboard-navigation.ts", import.meta.url),
    "utf8",
  );

  assert.match(page, /Trocar ou reparar o computador/);
  assert.match(page, /RepairConnectionFlow/);
  assert.match(flow, /PASSO 1 DE 3/);
  assert.match(flow, /PASSO 2 DE 3/);
  assert.match(flow, /RepairDiscoveryPanel/);
  assert.match(flow, /getRepairPairingStatusAction/);
  assert.match(actions, /create_site_pairing_code/);
  assert.match(actions, /last_heartbeat_at/);
  assert.match(tabs, /Trocar ou reparar computador/);
  assert.doesNotMatch(navigation, /id:\s*"pair-computer"/);
});

test("troca por local preserva IDs de câmera e move demonstração ativa", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260828195500_repair_pairing_preserves_cameras.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const discovered = await readFile(
    new URL("../app/api/agent/cameras/discovered/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(migration, /v_previous_agent_ids/);
  assert.match(migration, /set enabled = false/);
  assert.match(migration, /pairing_status = 'pairing'/);
  assert.match(migration, /update public\.trial_runs/);
  assert.match(migration, /agent_id = v_agent_id/);

  // O endpoint já validado reutiliza primeiro câmeras em pairing/unpaired
  // sem vínculo habilitado; a migration acima prepara exatamente esse estado.
  assert.match(discovered, /\.in\("pairing_status", \["unpaired", "pairing"\]\)/);
  assert.match(discovered, /\.eq\("enabled", true\)/);
  assert.match(discovered, /reuseMappingError/);
});

test("Store pública só é habilitada com link oficial apps.microsoft.com", async () => {
  const source = await readFile(
    new URL("../src/lib/installer-data.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /MONITORIA_STORE_PUBLIC_URL/);
  assert.match(source, /apps\.microsoft\.com/);
  assert.match(source, /storeDistribution/);
});

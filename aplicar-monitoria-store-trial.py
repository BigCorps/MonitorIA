#!/usr/bin/env python3
from pathlib import Path

TRIAL_TS = r'''import { appConfig } from "@/src/lib/app-config";

type TrialCaptureEndedEmail = {
  recipientEmail: string;
  organizationName: string;
  planName: string;
  explorationEndsAt: string | null;
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function trialEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function notifyTrialCaptureEnded(input: TrialCaptureEndedEmail) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false as const, error: "resend_not_configured" };

  const from = process.env.RESEND_FROM?.trim() || "onboarding@resend.dev";
  const plansUrl = `${appConfig.url}/dashboard/plans`;
  const explorationDate = formatDate(input.explorationEndsAt);

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#12212d;max-width:620px;margin:0 auto">
      <h2>Seu período gratuito de monitoramento terminou</h2>
      <p>As 24 horas de captura gratuita da <strong>${escapeHtml(input.organizationName)}</strong> foram concluídas.</p>
      <p>A câmera não continuará gerando novos acontecimentos durante o período de exploração.
      Você ainda pode consultar o que foi analisado ${explorationDate ? `até <strong>${escapeHtml(explorationDate)}</strong>` : "por tempo limitado"}.</p>
      <p>Plano testado: <strong>${escapeHtml(input.planName)}</strong></p>
      <p><a href="${plansUrl}">Ver planos e continuar</a></p>
    </div>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `MonitorIA <${from}>`,
        to: [input.recipientEmail],
        subject: "Seu período gratuito de monitoramento terminou",
        html,
      }),
    });

    if (!response.ok) {
      return { ok: false as const, error: `resend_${response.status}:${await response.text()}`.slice(0, 1000) };
    }
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message.slice(0, 1000) : "trial_email_unknown_error" };
  }
}
'''

MIGRATION = r'''create table if not exists public.trial_email_notifications (
  id uuid primary key default gen_random_uuid(),
  trial_run_id uuid not null references public.trial_runs(id) on delete cascade,
  notification_type text not null default 'capture_ended',
  status text not null default 'pending',
  attempts integer not null default 0,
  recipient_email text,
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trial_email_notifications_kind_check check (notification_type in ('capture_ended')),
  constraint trial_email_notifications_status_check check (status in ('pending','sending','sent','failed')),
  constraint trial_email_notifications_attempts_check check (attempts >= 0),
  constraint trial_email_notifications_unique unique (trial_run_id, notification_type)
);
create index if not exists trial_email_notifications_pending_idx
  on public.trial_email_notifications (status, updated_at)
  where status <> 'sent';
alter table public.trial_email_notifications enable row level security;
'''

def load(rel):
    p = Path(rel)
    if not p.exists():
        raise SystemExit(f"ERRO: arquivo não encontrado: {rel}")
    return p, p.read_text(encoding="utf-8")

def rep(text, old, new, rel):
    if old not in text:
        raise SystemExit(f"ERRO: trecho esperado não encontrado em {rel}")
    return text.replace(old, new, 1)

# novos arquivos
p = Path("src/lib/trial-notification.ts")
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(TRIAL_TS, encoding="utf-8")

m = Path("supabase/migrations/20260813220000_trial_capture_end_email_notifications.sql")
m.parent.mkdir(parents=True, exist_ok=True)
if not m.exists():
    m.write_text(MIGRATION, encoding="utf-8")

# cron trials
rel = "app/api/cron/trials/route.ts"
p, s = load(rel)
s = rep(s,
'import { createAdminClient } from "@/src/lib/supabase/admin";',
'import { createAdminClient } from "@/src/lib/supabase/admin";\nimport { notifyTrialCaptureEnded, trialEmailConfigured } from "@/src/lib/trial-notification";', rel)

marker = '''type TrialAsset = {
  id: string;
  bucket: string;
  storage_path: string;
};
'''
extra = marker + r'''
type TrialForEmail = {
  id: string;
  organization_id: string;
  selected_plan_code: string | null;
  exploration_ends_at: string | null;
};

async function processCaptureEndEmails(
  supabase: ReturnType<typeof createAdminClient>,
  now: string,
) {
  if (!trialEmailConfigured()) {
    return { configured: false, candidates: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const { data: trials, error } = await supabase
    .from("trial_runs")
    .select("id,organization_id,selected_plan_code,exploration_ends_at")
    .eq("status", "exploration")
    .not("capture_completed_at", "is", null)
    .order("capture_completed_at", { ascending: true })
    .limit(20);

  if (error) throw new Error(`trial_email_list_failed:${error.message}`);
  let sent = 0, failed = 0, skipped = 0;

  for (const trial of (trials ?? []) as TrialForEmail[]) {
    await supabase.from("trial_email_notifications").upsert({
      trial_run_id: trial.id,
      notification_type: "capture_ended",
      status: "pending",
      updated_at: now,
    }, { onConflict: "trial_run_id,notification_type", ignoreDuplicates: true });

    const { data: notification } = await supabase
      .from("trial_email_notifications")
      .select("id,status,attempts,updated_at")
      .eq("trial_run_id", trial.id)
      .eq("notification_type", "capture_ended")
      .single();

    if (!notification || notification.status === "sent") { skipped += 1; continue; }
    if (notification.status === "sending" && new Date(notification.updated_at).getTime() > Date.now() - 10 * 60 * 1000) {
      skipped += 1; continue;
    }

    const { data: claimed } = await supabase.from("trial_email_notifications").update({
      status: "sending",
      attempts: Number(notification.attempts ?? 0) + 1,
      claimed_at: now,
      updated_at: now,
      last_error: null,
    }).eq("id", notification.id).neq("status", "sent").select("id").maybeSingle();

    if (!claimed) { skipped += 1; continue; }

    const { data: organization, error: orgError } = await supabase
      .from("organizations").select("name,created_by")
      .eq("id", trial.organization_id).single();

    if (orgError || !organization?.created_by) {
      failed += 1;
      await supabase.from("trial_email_notifications").update({
        status: "failed", last_error: orgError?.message ?? "organization_owner_missing", updated_at: new Date().toISOString(),
      }).eq("id", notification.id);
      continue;
    }

    const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(String(organization.created_by));
    const recipientEmail = userResult.user?.email?.trim();
    if (userError || !recipientEmail) {
      failed += 1;
      await supabase.from("trial_email_notifications").update({
        status: "failed", last_error: userError?.message ?? "organization_owner_email_missing", updated_at: new Date().toISOString(),
      }).eq("id", notification.id);
      continue;
    }

    let planName = trial.selected_plan_code ?? "Plano MonitorIA";
    if (trial.selected_plan_code) {
      const { data: plan } = await supabase.from("camera_plan_catalog").select("display_name").eq("code", trial.selected_plan_code).maybeSingle();
      if (plan?.display_name) planName = String(plan.display_name);
    }

    const result = await notifyTrialCaptureEnded({
      recipientEmail,
      organizationName: String(organization.name ?? "sua empresa"),
      planName,
      explorationEndsAt: trial.exploration_ends_at,
    });

    if (result.ok) {
      sent += 1;
      await supabase.from("trial_email_notifications").update({
        status: "sent", recipient_email: recipientEmail, sent_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: null,
      }).eq("id", notification.id);
    } else {
      failed += 1;
      await supabase.from("trial_email_notifications").update({
        status: "failed", recipient_email: recipientEmail, last_error: result.error, updated_at: new Date().toISOString(),
      }).eq("id", notification.id);
    }
  }

  return { configured: true, candidates: trials?.length ?? 0, sent, failed, skipped };
}
'''
s = rep(s, marker, extra, rel)
s = rep(s,
'''  const { data: dueRows, error: dueError } = await supabase
    .from("trial_runs")
''',
'''  let notifications;
  try {
    notifications = await processCaptureEndEmails(supabase, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Falha ao processar emails do trial:", message);
    notifications = { configured: trialEmailConfigured(), candidates: 0, sent: 0, failed: 1, skipped: 0, error: message };
  }

  const { data: dueRows, error: dueError } = await supabase
    .from("trial_runs")
''', rel)
s = rep(s, '''      transitions,
      due: dueRows?.length ?? 0,
''', '''      transitions,
      notifications,
      due: dueRows?.length ?? 0,
''', rel)
p.write_text(s, encoding="utf-8")

# installer com nome separado da Store
rel = "installer/monitoria.iss"
p, s = load(rel)
s = rep(s, "OutputBaseFilename=MonitorIA-Setup", '''#ifdef StoreBuild
OutputBaseFilename=MonitorIA-Store-Setup
#else
OutputBaseFilename=MonitorIA-Setup
#endif''', rel)
p.write_text(s, encoding="utf-8")

# workflow: segundo build + artifact
rel = ".github/workflows/build-agent.yml"
p, s = load(rel)
needle = '''          if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o instalador." }

      - name: Resumo do build
'''
replacement = '''          if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o instalador." }

          if ('${{ steps.signing.outputs.enabled }}' -eq 'true') {
            $wrapper = "${{ steps.inno_sign.outputs.wrapper }}"
            $pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source
            $signCommand = '$q' + $pwsh + '$q -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $q' + $wrapper + '$q $f'
            & $iscc "/DAppVersion=$env:AGENT_VERSION" "/DStoreBuild=1" "/DSignCommand=1" "/Smonitoria=$signCommand" "installer\\monitoria.iss"
          } else {
            & $iscc "/DAppVersion=$env:AGENT_VERSION" "/DStoreBuild=1" "installer\\monitoria.iss"
          }
          if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o instalador Microsoft Store." }

      - name: Resumo do build
'''
s = rep(s, needle, replacement, rel)
s = rep(s,
'''      - name: Publicar release
        if: startsWith(github.ref, 'refs/tags/agent-v')
''',
'''      - name: Publicar artefato Microsoft Store
        uses: actions/upload-artifact@v4
        with:
          name: MonitorIA-Store-Setup-${{ env.AGENT_VERSION }}
          path: dist/MonitorIA-Store-Setup.exe
          if-no-files-found: error
          retention-days: 30

      - name: Publicar release
        if: startsWith(github.ref, 'refs/tags/agent-v')
''', rel)
s = rep(s,
'''        with:
          files: dist/MonitorIA-Setup.exe
          fail_on_unmatched_files: true
''',
'''        with:
          files: |
            dist/MonitorIA-Setup.exe
            dist/MonitorIA-Store-Setup.exe
          fail_on_unmatched_files: true
''', rel)
p.write_text(s, encoding="utf-8")

# testes
Path("test/trial-capture-end-email.test.ts").write_text(r'''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("trial envia email idempotente apos captura", async () => {
  const source = await readFile(new URL("../app/api/cron/trials/route.ts", import.meta.url), "utf8");
  assert.match(source, /trial_email_notifications/);
  assert.match(source, /capture_ended/);
  assert.match(source, /notifyTrialCaptureEnded/);
});

test("workflow gera artefato Microsoft Store", async () => {
  const workflow = await readFile(new URL("../.github/workflows/build-agent.yml", import.meta.url), "utf8");
  const installer = await readFile(new URL("../installer/monitoria.iss", import.meta.url), "utf8");
  assert.match(workflow, /DStoreBuild=1/);
  assert.match(workflow, /MonitorIA-Store-Setup-/);
  assert.match(installer, /MonitorIA-Store-Setup/);
});
''', encoding="utf-8")

print("Implementações aplicadas.")
print("Agora rode: npm install && npm run check && npm test")

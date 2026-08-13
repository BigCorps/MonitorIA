import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { notifyTrialCaptureEnded, trialEmailConfigured } from "@/src/lib/trial-notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TRIAL_BATCH_SIZE = 8;
const ASSET_BATCH_SIZE = 500;
const ALLOWED_BUCKETS = new Set([
  "analysis-frames",
  "event-keyframes",
  "preserved-clips",
]);

type TrialDue = {
  id: string;
  organization_id: string;
};

type TrialAsset = {
  id: string;
  bucket: string;
  storage_path: string;
};

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

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(
    secret &&
      secret.length >= 16 &&
      request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

async function deleteTrialAssets(
  supabase: ReturnType<typeof createAdminClient>,
  trialId: string,
) {
  const { data, error } = await supabase
    .from("storage_assets")
    .select("id,bucket,storage_path")
    .eq("trial_run_id", trialId)
    .is("deleted_at", null)
    .neq("status", "deleted")
    .order("created_at", { ascending: true })
    .limit(ASSET_BATCH_SIZE);

  if (error) throw new Error(error.message);

  const assets = (data ?? []) as TrialAsset[];
  const byBucket = new Map<string, TrialAsset[]>();

  for (const asset of assets) {
    if (!ALLOWED_BUCKETS.has(asset.bucket)) {
      throw new Error(`trial_bucket_not_allowed:${asset.bucket}`);
    }

    const group = byBucket.get(asset.bucket) ?? [];
    group.push(asset);
    byBucket.set(asset.bucket, group);
  }

  const deletedIds: string[] = [];

  for (const [bucket, group] of byBucket) {
    const { error: removeError } = await supabase.storage
      .from(bucket)
      .remove(group.map((asset) => asset.storage_path));

    if (removeError) {
      throw new Error(`trial_storage_remove_failed:${removeError.message}`);
    }

    deletedIds.push(...group.map((asset) => asset.id));
  }

  if (deletedIds.length) {
    const { error: markError } = await supabase
      .from("storage_assets")
      .update({
        status: "deleted",
        deleted_at: new Date().toISOString(),
      })
      .in("id", deletedIds);

    if (markError) {
      throw new Error(`trial_storage_mark_failed:${markError.message}`);
    }
  }

  const { count, error: countError } = await supabase
    .from("storage_assets")
    .select("id", { count: "exact", head: true })
    .eq("trial_run_id", trialId)
    .is("deleted_at", null)
    .neq("status", "deleted");

  if (countError) throw new Error(countError.message);

  return {
    scanned: assets.length,
    deleted: deletedIds.length,
    remaining: count ?? 0,
  };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data: transitions, error: transitionError } =
    await supabase.rpc("process_monitoria_trials");

  if (transitionError) {
    console.error(
      "Falha ao processar estados do trial:",
      transitionError.message,
    );
    return NextResponse.json(
      { ok: false, error: "trial_transition_failed" },
      { status: 500 },
    );
  }

  let notifications;
  try {
    notifications = await processCaptureEndEmails(supabase, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Falha ao processar emails do trial:", message);
    notifications = { configured: trialEmailConfigured(), candidates: 0, sent: 0, failed: 1, skipped: 0, error: message };
  }

  const { data: dueRows, error: dueError } = await supabase
    .from("trial_runs")
    .select("id,organization_id")
    .eq("status", "expired")
    .lte("purge_after", now)
    .order("purge_after", { ascending: true })
    .limit(TRIAL_BATCH_SIZE);

  if (dueError) {
    console.error("Falha ao listar trials vencidos:", dueError.message);
    return NextResponse.json(
      { ok: false, error: "trial_purge_list_failed" },
      { status: 500 },
    );
  }

  const results: Array<Record<string, unknown>> = [];

  for (const trial of (dueRows ?? []) as TrialDue[]) {
    try {
      const storage = await deleteTrialAssets(supabase, trial.id);

      if (storage.remaining > 0) {
        results.push({
          trialId: trial.id,
          status: "storage_pending",
          ...storage,
        });
        continue;
      }

      const { data: purge, error: purgeError } = await supabase.rpc(
        "purge_monitoria_trial_data",
        { p_trial_run_id: trial.id },
      );

      if (purgeError) throw new Error(purgeError.message);

      results.push({
        trialId: trial.id,
        status: "purged",
        storage,
        purge,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(`Falha no expurgo do trial ${trial.id}:`, message);
      results.push({
        trialId: trial.id,
        status: "failed",
        error: message,
      });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      transitions,
      notifications,
      due: dueRows?.length ?? 0,
      results,
      executedAt: now,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { getSalesTrialInvite } from "@/src/lib/sales-trial";
import {
  VIP_ASSIST_COOKIE,
  isVipAssistSection,
  vipAssistAlias,
} from "@/src/vip/assisted";

export const dynamic = "force-dynamic";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(VIP_ASSIST_COOKIE)?.value ?? "";
  const invite = token ? await getSalesTrialInvite(token).catch(() => null) : null;

  if (!invite?.vipProjectId || !["active", "redeemed"].includes(invite.status)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const payload = objectValue(body);
  const section = isVipAssistSection(payload.section)
    ? payload.section
    : "inicio";
  const kind = payload.kind === "opened" ? "opened" : "section";
  const now = new Date().toISOString();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("sales_trial_invites")
    .select("metadata")
    .eq("id", invite.id)
    .maybeSingle();

  if (error) {
    console.error("vip_assisted_presence_read:", error.message);
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const metadata = objectValue(data?.metadata);
  const previous = objectValue(metadata.assistedJourney);
  const openedAt = String(previous.openedAt ?? "") || now;
  const visitCount =
    kind === "opened" ? Math.max(0, Number(previous.visitCount ?? 0)) + 1 : Number(previous.visitCount ?? 0);

  const { error: updateError } = await admin
    .from("sales_trial_invites")
    .update({
      metadata: {
        ...metadata,
        assistedJourney: {
          ...previous,
          clarityAlias: vipAssistAlias(invite.id),
          openedAt,
          visitCount,
          lastSeenAt: now,
          lastSection: section,
        },
      },
      updated_at: now,
    })
    .eq("id", invite.id);

  if (updateError) {
    console.error("vip_assisted_presence_update:", updateError.message);
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}

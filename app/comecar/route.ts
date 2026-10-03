import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { getSalesTrialInvite } from "@/src/lib/sales-trial";
import { VIP_ASSIST_COOKIE, vipAssistAlias } from "@/src/vip/assisted";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(VIP_ASSIST_COOKIE)?.value ?? "";
  const invite = token ? await getSalesTrialInvite(token).catch(() => null) : null;

  if (!invite?.vipProjectId || !["active", "redeemed"].includes(invite.status)) {
    return NextResponse.redirect(new URL("/", request.url), 307);
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("sales_trial_invites")
    .select("metadata")
    .eq("id", invite.id)
    .maybeSingle();

  const metadata =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  const previous =
    metadata.assistedJourney &&
    typeof metadata.assistedJourney === "object" &&
    !Array.isArray(metadata.assistedJourney)
      ? (metadata.assistedJourney as Record<string, unknown>)
      : {};

  await admin
    .from("sales_trial_invites")
    .update({
      metadata: {
        ...metadata,
        assistedJourney: {
          ...previous,
          clarityAlias: vipAssistAlias(invite.id),
          startClickedAt: new Date().toISOString(),
          lastSection: "pronto",
          lastSeenAt: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", invite.id);

  return NextResponse.redirect(
    new URL(`/lead/${encodeURIComponent(token)}`, request.url),
    307,
  );
}

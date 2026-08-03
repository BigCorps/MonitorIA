import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(
    secret &&
      secret.length >= 16 &&
      request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "process_assistant_commercial_state",
  );

  if (error) {
    console.error("Falha na manutenção do Assistente:", error.message);
    return NextResponse.json(
      { ok: false, error: "assistant_commercial_maintenance_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, result: data, executedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

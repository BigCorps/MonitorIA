import { NextResponse, type NextRequest } from "next/server";

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json(
      { ok: false, error: "supabase_not_configured" },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/monitoria-process-billing`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRole}`,
          apikey: serviceRole,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ source: "vercel-cron" }),
        cache: "no-store",
        signal: AbortSignal.timeout(50000),
      },
    );

    const payload = await response.json().catch(() => ({
      success: false,
      error: "invalid_edge_response",
    }));

    if (!response.ok) {
      console.error("Cron de cobrança falhou:", payload);
      return NextResponse.json(
        { ok: false, edge: payload },
        { status: response.status },
      );
    }

    return NextResponse.json(
      { ok: true, edge: payload },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "Falha ao executar cron de cobrança:",
      error instanceof Error ? error.message : String(error),
    );

    return NextResponse.json(
      { ok: false, error: "billing_cron_failed" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { appConfig } from "@/src/lib/app-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const supabase = await createClient();
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();

  if (authError || !claimsData?.claims?.sub) {
    return NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 });
  }

  const { error: databaseError, count } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true });

  const checks = {
    authentication: true,
    database: !databaseError,
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    openAIConfigured: Boolean(process.env.OPENAI_API_KEY),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
  };

  const ok = Object.values(checks).every(Boolean);

  return NextResponse.json(
    {
      ok,
      service: "monitoria-web",
      version: appConfig.version,
      latencyMs: Date.now() - startedAt,
      accessibleOrganizations: count ?? 0,
      checks,
      timestamp: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

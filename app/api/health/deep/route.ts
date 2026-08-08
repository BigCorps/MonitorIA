import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { appConfig } from "@/src/lib/app-config";
import { isInternalOperatorEmail } from "@/src/lib/internal-operator";

export const dynamic = "force-dynamic";

/**
 * Verificação profunda de saúde.
 *
 * Antes bastava estar autenticado para receber a configuração da
 * plataforma: quais provedores de IA estão ligados, se o segredo do Agent
 * existe, a versão implantada e quantas organizações a sessão enxerga.
 * São booleanos, não segredos — mas dizem a um cliente (ou a quem tomar a
 * conta dele) qual fornecedor usamos e o que está configurado.
 *
 * Agora o detalhe é só para operador interno. Cliente autenticado recebe
 * apenas o essencial para saber se o serviço responde.
 */
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
    agentSecretConfigured: Boolean(process.env.MONITORIA_AGENT_SECRET),
  };

  const ok = Object.values(checks).every(Boolean);

  const email =
    typeof claimsData.claims.email === "string"
      ? claimsData.claims.email
      : null;

  // Resposta enxuta para quem não é operador interno. O status HTTP continua
  // igual, então qualquer monitor externo que só olhe o código não quebra.
  if (!isInternalOperatorEmail(email)) {
    return NextResponse.json(
      {
        ok,
        service: "monitoria-web",
        timestamp: new Date().toISOString(),
      },
      {
        status: ok ? 200 : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

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

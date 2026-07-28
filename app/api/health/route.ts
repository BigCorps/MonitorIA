import { NextResponse } from "next/server";
import { appConfig } from "@/src/lib/app-config";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "monitoria-web",
      version: appConfig.version,
      timestamp: new Date().toISOString(),
      configuration: {
        supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        supabasePublishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
        openAI: Boolean(process.env.OPENAI_API_KEY),
        groq: Boolean(process.env.GROQ_API_KEY),
        agentSecret: Boolean(process.env.MONITORIA_AGENT_SECRET),
        visionModel: process.env.VISION_MODEL ?? "gpt-5-mini",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

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
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

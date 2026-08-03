import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getAssistantBalance } from "@/src/lib/assistant-commercial-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 },
    );
  }

  const organization = await getCurrentOrganization(user.id);
  if (!organization) {
    return NextResponse.json(
      { ok: false, error: "organization_not_found" },
      { status: 404 },
    );
  }

  try {
    const balance = await getAssistantBalance(organization.id);
    return NextResponse.json(
      { ok: true, balance },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "Falha ao consultar saldo do Assistente:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      { ok: false, error: "assistant_balance_unavailable" },
      { status: 503 },
    );
  }
}

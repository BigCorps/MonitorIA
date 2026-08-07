import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { consumeRateLimit, rateLimitHeaders } from "@/src/lib/rate-limit";
import { buildSupportDiagnostics } from "@/src/lib/support-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) {
    return NextResponse.json({ ok: false, error: "organization_not_found" }, { status: 404 });
  }

  let rateLimit;
  try {
    rateLimit = await consumeRateLimit({
      scope: "support-diagnostics",
      subject: `${organization.id}:${user.id}`,
      limit: 5,
      windowSeconds: 60,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "rate_limit_unavailable" }, { status: 503 });
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "too_many_requests" },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }

  const diagnostics = await buildSupportDiagnostics({
    organizationId: organization.id,
    organizationName: organization.name,
  });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(diagnostics, null, 2), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="monitoria-diagnostico-${date}.json"`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...rateLimitHeaders(rateLimit),
    },
  });
}


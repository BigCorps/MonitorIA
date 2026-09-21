import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 },
    );
  }

  const organization = await getCurrentOrganization(user.id);

  if (
    !organization ||
    !["owner", "admin"].includes(organization.role)
  ) {
    return NextResponse.json(
      { ok: false, error: "not_authorized" },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: "recording_clip_not_available",
      message:
        "O vídeo original já está com você. O MonitorIA apresenta os acontecimentos e o período em que ocorreram.",
    },
    { status: 410 },
  );
}

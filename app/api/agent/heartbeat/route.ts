import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/src/lib/agent-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FingerprintHashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/);

const HeartbeatSchema = z.object({
  version: z.string().trim().max(80).optional(),
  platform: z.string().trim().max(80).optional(),
  architecture: z.string().trim().max(80).optional(),
  cpuPercent: z.number().min(0).max(100).optional(),
  memoryBytes: z.number().int().nonnegative().optional(),
  diskFreeBytes: z.number().int().nonnegative().optional(),
  queuedEvents: z
    .number()
    .int()
    .nonnegative()
    .max(1_000_000)
    .default(0),
  metadata: z.record(z.unknown()).optional(),
});

function fingerprintFromMetadata(
  metadata: Record<string, unknown> | undefined,
) {
  const value = metadata?.installationFingerprintHash;
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = FingerprintHashSchema.safeParse(value);
  return parsed.success ? parsed.data : "invalid";
}

export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json(
      { ok: false, error: "invalid_agent_token" },
      { status: 401 },
    );
  }

  let body: z.infer<typeof HeartbeatSchema>;
  try {
    body = HeartbeatSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 },
    );
  }

  const nextFingerprint = fingerprintFromMetadata(body.metadata);
  if (nextFingerprint === "invalid") {
    return NextResponse.json(
      { ok: false, error: "invalid_installation_fingerprint" },
      { status: 400 },
    );
  }

  const currentFingerprint = fingerprintFromMetadata(
    agent.metadata as Record<string, unknown>,
  );

  if (
    currentFingerprint &&
    currentFingerprint !== "invalid" &&
    nextFingerprint &&
    currentFingerprint !== nextFingerprint
  ) {
    return NextResponse.json(
      { ok: false, error: "installation_fingerprint_changed" },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const forwardedFor =
    request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim() || null;
  const supabase = createAdminClient();
  const metadata = {
    ...agent.metadata,
    ...(body.metadata ?? {}),
    ...(currentFingerprint && currentFingerprint !== "invalid"
      ? { installationFingerprintHash: currentFingerprint }
      : nextFingerprint
        ? { installationFingerprintHash: nextFingerprint }
        : {}),
  };

  const { error: updateError } = await supabase
    .from("agents")
    .update({
      status: "online",
      version: body.version ?? undefined,
      platform: body.platform ?? undefined,
      architecture: body.architecture ?? undefined,
      last_heartbeat_at: now,
      last_ip: forwardedFor,
      metadata,
    })
    .eq("id", agent.id);

  if (updateError) {
    console.error(
      "Falha ao atualizar heartbeat do Agent:",
      updateError.message,
    );
    return NextResponse.json(
      { ok: false, error: "heartbeat_failed" },
      { status: 500 },
    );
  }

  const { error: healthError } = await supabase
    .from("agent_health")
    .insert({
      organization_id: agent.organizationId,
      agent_id: agent.id,
      recorded_at: now,
      status: "online",
      cpu_percent: body.cpuPercent ?? null,
      memory_bytes: body.memoryBytes ?? null,
      disk_free_bytes: body.diskFreeBytes ?? null,
      queued_events: body.queuedEvents,
      metadata: body.metadata ?? {},
    });

  if (healthError) {
    console.error(
      "Falha ao registrar saúde do Agent:",
      healthError.message,
    );
  }

  return NextResponse.json(
    {
      ok: true,
      agentId: agent.id,
      serverTime: now,
      installationFingerprintRegistered: Boolean(
        currentFingerprint || nextFingerprint,
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/src/lib/agent-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registro de compatibilidade de equipamento.
 *
 * Alimenta o catálogo global de caminhos RTSP com hardware real. O Agent
 * envia apenas o caminho normalizado — sem credencial e sem IP —, e o schema
 * abaixo rejeita qualquer coisa que pareça um endereço concreto, para o caso
 * de uma versão futura do Agent regredir nesse ponto.
 *
 * Builds anteriores usaram {USUARIO}/{SENHA} nos caminhos ONVIF, enquanto o
 * catálogo novo usa {USERNAME}/{PASSWORD}. Aceitamos os dois formatos na
 * borda e persistimos somente o formato canônico em inglês. Assim a correção
 * é retrocompatível e não exige migration nem invalida Agents já instalados.
 */

const NORMALIZED_PATH =
  /^rtsp:\/\/(?:\{USERNAME\}:\{PASSWORD\}|\{USUARIO\}:\{SENHA\})@\{IP\}:\{PORT\}\//;

function canonicalPathTemplate(value: string) {
  return value
    .replace(/\{USUARIO\}/g, "{USERNAME}")
    .replace(/\{SENHA\}/g, "{PASSWORD}");
}

const CompatibilitySchema = z.object({
  vendor: z.string().trim().max(120).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  firmware: z.string().trim().max(120).nullable().optional(),
  deviceType: z.enum(["camera", "dvr", "nvr", "encoder"]).default("camera"),
  source: z.enum([
    "hardware_validated",
    "official_documentation",
    "onvif_discovered",
    "runtime_validated",
    "heuristic_candidate",
  ]),
  rtspPort: z.number().int().min(1).max(65535),
  pathTemplate: z
    .string()
    .trim()
    .max(300)
    .refine((value) => NORMALIZED_PATH.test(value), {
      message: "path_not_normalized",
    })
    .refine((value) => !/\d{1,3}(\.\d{1,3}){3}/.test(value), {
      message: "path_contains_address",
    }),
  streamType: z.enum(["main", "sub"]),
  codec: z.string().trim().max(40).nullable().optional(),
  resolution: z
    .string()
    .trim()
    .max(20)
    .regex(/^\d+x\d+$/)
    .nullable()
    .optional(),
  onvifSupported: z.boolean().default(false),
  validatedAt: z.string().datetime().optional(),
  agentVersion: z.string().trim().max(40).nullable().optional(),
  success: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) {
    return NextResponse.json({ ok: false, error: "invalid_agent_token" }, { status: 401 });
  }

  let body: z.infer<typeof CompatibilitySchema>;

  try {
    body = CompatibilitySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("record_device_compatibility", {
    p_vendor: body.vendor ?? null,
    p_model: body.model ?? null,
    p_firmware: body.firmware ?? null,
    p_device_type: body.deviceType,
    p_source: body.source,
    p_rtsp_port: body.rtspPort,
    p_path_template: canonicalPathTemplate(body.pathTemplate),
    p_stream_type: body.streamType,
    p_codec: body.codec ?? null,
    p_resolution: body.resolution ?? null,
    p_onvif_supported: body.onvifSupported,
    p_agent_version: body.agentVersion ?? null,
    p_success: body.success,
  });

  if (error) {
    console.error("Falha ao registrar compatibilidade:", error.message);
    return NextResponse.json({ ok: false, error: "record_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data });
}

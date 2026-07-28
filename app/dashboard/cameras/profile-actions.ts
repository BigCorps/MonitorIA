"use server";

import { Buffer } from "node:buffer";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import type { CameraProfileDraft } from "@/src/contracts/camera-profile-draft";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createVisionProvider } from "@/src/vision/create-provider";
import { estimateVisionCostUsd } from "@/src/vision/cost";
import type { CameraProfileActionState } from "./profile-action-state";

const IdSchema = z.string().uuid();

function uniqueStrings(values: unknown[], maximum: number) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const text = String(value ?? "").trim().slice(0, 300);
    const key = text.toLocaleLowerCase("pt-BR");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maximum) break;
  }

  return result;
}

function relationValue<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function authorizeCamera(cameraId: string) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization || !["owner", "admin"].includes(organization.role)) {
    return {
      error: "Sua conta não tem permissão para alterar o perfil da câmera.",
    } as const;
  }

  const supabase = createAdminClient();
  const { data: camera, error } = await supabase
    .from("cameras")
    .select(`
      id,
      name,
      description,
      monitoring_goals,
      status,
      site:sites(name,timezone)
    `)
    .eq("id", cameraId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (error || !camera) {
    return { error: "Câmera não encontrada." } as const;
  }

  const site = relationValue(
    camera.site as
      | { name: string; timezone: string }
      | Array<{ name: string; timezone: string }>
      | null,
  );

  if (!site) {
    return { error: "O local da câmera não foi encontrado." } as const;
  }

  return {
    user,
    organization,
    supabase,
    camera: {
      id: String(camera.id),
      name: String(camera.name),
      description: String(camera.description ?? ""),
      monitoringGoals: Array.isArray(camera.monitoring_goals)
        ? camera.monitoring_goals.map((goal: unknown) => String(goal))
        : [],
      status: String(camera.status),
      siteName: String(site.name),
      timezone: String(site.timezone),
    },
  } as const;
}

export async function analyzeCameraProfileAction(
  _previousState: CameraProfileActionState,
  formData: FormData,
): Promise<CameraProfileActionState> {
  const cameraId = String(formData.get("camera_id") ?? "");
  if (!IdSchema.safeParse(cameraId).success) {
    return { status: "error", message: "Identificador da câmera inválido." };
  }

  const authorized = await authorizeCamera(cameraId);
  if ("error" in authorized) {
    return {
      status: "error",
      message: authorized.error ?? "Não foi possível autorizar esta operação.",
    };
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      status: "error",
      message: "A chave OPENAI_API_KEY ainda não está configurada na Vercel.",
    };
  }

  const { data: asset, error: assetError } = await authorized.supabase
    .from("storage_assets")
    .select("id,bucket,storage_path,mime_type,byte_size,captured_at")
    .eq("organization_id", authorized.organization.id)
    .eq("camera_id", cameraId)
    .eq("kind", "analysis_frame")
    .eq("status", "ready")
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (assetError || !asset) {
    return {
      status: "error",
      message: "Nenhum primeiro frame está disponível para análise.",
    };
  }

  if (String(asset.mime_type) !== "image/jpeg") {
    return {
      status: "error",
      message: "O frame disponível não está no formato JPEG esperado.",
    };
  }

  const declaredSize = Number(asset.byte_size ?? 0);
  if (declaredSize > 5 * 1024 * 1024) {
    return {
      status: "error",
      message: "O frame é grande demais para a análise inicial.",
    };
  }

  const { data: file, error: downloadError } =
    await authorized.supabase.storage
      .from(String(asset.bucket))
      .download(String(asset.storage_path));

  if (downloadError || !file) {
    console.error("Falha ao baixar frame para perfil:", downloadError?.message);
    return {
      status: "error",
      message: "Não foi possível carregar o primeiro frame.",
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length < 1024 || bytes.length > 5 * 1024 * 1024) {
    return {
      status: "error",
      message: "O conteúdo do primeiro frame é inválido.",
    };
  }

  try {
    const provider = createVisionProvider();
    if (!provider.analyzeCameraProfile) {
      return {
        status: "error",
        message: "O provedor de visão atual não cria perfis de câmera.",
      };
    }

    const analysis = await provider.analyzeCameraProfile({
      organizationId: authorized.organization.id,
      cameraId,
      cameraName: authorized.camera.name,
      cameraDescription: authorized.camera.description,
      siteName: authorized.camera.siteName,
      timezone: authorized.camera.timezone,
      capturedAt: String(asset.captured_at ?? new Date().toISOString()),
      initialMonitoringGoals: authorized.camera.monitoringGoals,
      imageUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
    });

    const monitoringGoals = uniqueStrings(
      [
        ...authorized.camera.monitoringGoals,
        ...analysis.profile.monitoringGoals,
      ],
      20,
    );

    const ignoreInstructions = uniqueStrings(
      analysis.profile.ignoreInstructions,
      20,
    );

    const zones = analysis.profile.zones.map((zone: CameraProfileDraft["zones"][number], index: number) => ({
      name: zone.name,
      type: zone.type,
      description: zone.description,
      polygon: zone.polygon,
      sortOrder: index,
    }));

    const profileMetadata = {
      sceneType: analysis.profile.sceneType,
      fixedElements: analysis.profile.fixedElements,
      privacyNotes: analysis.profile.privacyNotes,
      imageQuality: analysis.profile.imageQuality,
      confidence: analysis.profile.confidence,
      sourceCapturedAt: String(asset.captured_at ?? ""),
      latencyMs: analysis.latencyMs,
      usage: analysis.usage,
    };

    const { data: created, error: createError } =
      await authorized.supabase.rpc("create_camera_profile_draft", {
        p_organization_id: authorized.organization.id,
        p_camera_id: cameraId,
        p_source_asset_id: String(asset.id),
        p_environment_description:
          analysis.profile.environmentDescription,
        p_monitoring_goals: monitoringGoals,
        p_ignore_instructions: ignoreInstructions,
        p_zones: zones,
        p_provider: analysis.provider,
        p_model: analysis.model,
        p_response_id: analysis.responseId,
        p_profile_metadata: profileMetadata,
        p_created_by: authorized.user.id,
      });

    const createdProfile = Array.isArray(created) ? created[0] : created;
    if (createError || !createdProfile) {
      console.error(
        "Falha ao gravar perfil inteligente:",
        createError?.message,
      );
      return {
        status: "error",
        message: "A análise foi concluída, mas o perfil não pôde ser salvo.",
      };
    }

    const estimatedCostUsd = estimateVisionCostUsd(
      analysis.model,
      analysis.usage,
    );

    const { error: usageError } = await authorized.supabase
      .from("usage_events")
      .insert({
        organization_id: authorized.organization.id,
        camera_id: cameraId,
        analysis_job_id: null,
        provider: analysis.provider,
        model: analysis.model,
        input_tokens: analysis.usage.inputTokens,
        output_tokens: analysis.usage.outputTokens,
        estimated_cost_usd: estimatedCostUsd,
        metadata: {
          purpose: "camera_profile",
          profile_id: String(createdProfile.profile_id),
          profile_version: Number(createdProfile.profile_version),
          response_id: analysis.responseId,
          latency_ms: analysis.latencyMs,
          source_asset_id: String(asset.id),
        },
      });

    if (usageError) {
      console.error("Falha ao registrar custo do perfil:", usageError.message);
    }

    const preserveUntil = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error: assetUpdateError } = await authorized.supabase
      .from("storage_assets")
      .update({ expires_at: preserveUntil })
      .eq("id", asset.id)
      .lt("expires_at", preserveUntil);

    if (assetUpdateError) {
      console.error(
        "Falha ao estender retenção do frame de perfil:",
        assetUpdateError.message,
      );
    }

    const { error: auditError } = await authorized.supabase
      .from("audit_logs")
      .insert({
        organization_id: authorized.organization.id,
        actor_user_id: authorized.user.id,
        action: "camera.profile_generated",
        entity_type: "camera_profile",
        entity_id: String(createdProfile.profile_id),
        metadata: {
          camera_id: cameraId,
          version: Number(createdProfile.profile_version),
          provider: analysis.provider,
          model: analysis.model,
          response_id: analysis.responseId,
          source_asset_id: String(asset.id),
        },
      });

    if (auditError) {
      console.error("Falha ao registrar auditoria do perfil:", auditError.message);
    }

    revalidatePath(`/dashboard/cameras/${cameraId}`);
    revalidatePath("/dashboard/cameras");
    revalidatePath("/dashboard");

    return {
      status: "success",
      message: `Perfil v${Number(createdProfile.profile_version)} criado. Revise as informações antes de aprovar.`,
      profileId: String(createdProfile.profile_id),
    };
  } catch (error) {
    console.error("Falha na análise do perfil da câmera:", error);
    return {
      status: "error",
      message:
        "A IA não conseguiu criar o perfil agora. Verifique a chave, o saldo e tente novamente.",
    };
  }
}

export async function approveCameraProfileAction(
  _previousState: CameraProfileActionState,
  formData: FormData,
): Promise<CameraProfileActionState> {
  const cameraId = String(formData.get("camera_id") ?? "");
  const profileId = String(formData.get("profile_id") ?? "");

  if (
    !IdSchema.safeParse(cameraId).success ||
    !IdSchema.safeParse(profileId).success
  ) {
    return { status: "error", message: "Perfil ou câmera inválidos." };
  }

  const authorized = await authorizeCamera(cameraId);
  if ("error" in authorized) {
    return {
      status: "error",
      message: authorized.error ?? "Não foi possível autorizar esta operação.",
    };
  }

  const { data: profile, error: profileError } = await authorized.supabase
    .from("camera_profiles")
    .select("id,version,camera_id,is_active")
    .eq("id", profileId)
    .eq("camera_id", cameraId)
    .eq("organization_id", authorized.organization.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { status: "error", message: "O perfil não foi encontrado." };
  }

  if (profile.is_active) {
    return {
      status: "success",
      message: `O perfil v${Number(profile.version)} já está ativo.`,
      profileId,
    };
  }

  const { data: activated, error: activateError } =
    await authorized.supabase.rpc("activate_camera_profile", {
      p_organization_id: authorized.organization.id,
      p_profile_id: profileId,
      p_reviewed_by: authorized.user.id,
    });

  const activatedProfile = Array.isArray(activated)
    ? activated[0]
    : activated;

  if (activateError || !activatedProfile) {
    console.error("Falha ao ativar perfil:", activateError?.message);
    return {
      status: "error",
      message: "Não foi possível aprovar o perfil.",
    };
  }

  const { error: auditError } = await authorized.supabase
    .from("audit_logs")
    .insert({
      organization_id: authorized.organization.id,
      actor_user_id: authorized.user.id,
      action: "camera.profile_activated",
      entity_type: "camera_profile",
      entity_id: profileId,
      metadata: {
        camera_id: cameraId,
        version: Number(activatedProfile.active_version),
      },
    });

  if (auditError) {
    console.error("Falha ao registrar ativação do perfil:", auditError.message);
  }

  revalidatePath(`/dashboard/cameras/${cameraId}`);
  revalidatePath("/dashboard/cameras");
  revalidatePath("/dashboard");

  return {
    status: "success",
    message: `Perfil v${Number(activatedProfile.active_version)} aprovado e ativado.`,
    profileId,
  };
}

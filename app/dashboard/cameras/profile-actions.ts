"use server";

import { Buffer } from "node:buffer";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { CameraOperationalContextSchema } from "@/src/contracts/camera-profile";
import type { CameraProfileDraft } from "@/src/contracts/camera-profile-draft";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createVisionProvider } from "@/src/vision/create-provider";
import {
  estimateVisionCostBreakdown,
} from "@/src/vision/cost";
import type { CameraProfileActionState } from "./profile-action-state";

const IdSchema = z.string().uuid();

const PointSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })
  .strict();

const ManualZoneSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: z.enum([
      "entry",
      "exit",
      "service",
      "restricted",
      "ignore",
      "general",
    ]),
    personRoleHint: z.enum([
      "none",
      "staff",
      "customer",
      "delivery_person",
      "visitor",
      "shared",
    ]),
    description: z.string().trim().max(500),
    polygon: z.array(PointSchema).min(3).max(50),
  })
  .strict();

const ManualProfileSchema = z
  .object({
    operationalContext: CameraOperationalContextSchema,
    environmentDescription: z
      .string()
      .trim()
      .min(20)
      .max(2000),
    monitoringGoals: z
      .array(z.string().trim().min(1).max(300))
      .min(1)
      .max(30),
    ignoreInstructions: z
      .array(z.string().trim().min(1).max(300))
      .max(30),
    zones: z.array(ManualZoneSchema).min(1).max(50),
    sceneType: z.enum([
      "indoor",
      "outdoor",
      "mixed",
      "unknown",
    ]),
    fixedElements: z
      .array(z.string().trim().min(1).max(250))
      .max(15),
    privacyNotes: z
      .array(z.string().trim().min(1).max(300))
      .max(10),
    imageQuality: z
      .object({
        overall: z.enum([
          "good",
          "usable",
          "limited",
          "poor",
          "unknown",
        ]),
        lighting: z.string().max(300),
        visibility: z.string().max(300),
        limitations: z
          .array(z.string().trim().min(1).max(300))
          .max(10),
      })
      .nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    basedOnProfileId: z.string().uuid().nullable(),
  })
  .strict();

function uniqueStrings(
  values: unknown[],
  maximum: number,
) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const text = String(value ?? "")
      .trim()
      .slice(0, 300);
    const key = text.toLocaleLowerCase("pt-BR");

    if (!text || seen.has(key)) continue;

    seen.add(key);
    result.push(text);

    if (result.length >= maximum) break;
  }

  return result;
}

function relationValue<T>(
  value: T | T[] | null,
): T | null {
  return Array.isArray(value)
    ? value[0] ?? null
    : value;
}

function actionError(
  message: string,
): CameraProfileActionState {
  return { status: "error", message };
}

async function authorizeCamera(cameraId: string) {
  const user = await requireAuthenticatedUser();
  const organization =
    await getCurrentOrganization(user.id);

  if (
    !organization ||
    !["owner", "admin"].includes(
      organization.role,
    )
  ) {
    return {
      error:
        "Sua conta não tem permissão para alterar o perfil da câmera.",
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
    return {
      error: "Câmera não encontrada.",
    } as const;
  }

  const site = relationValue(
    camera.site as
      | { name: string; timezone: string }
      | Array<{
          name: string;
          timezone: string;
        }>
      | null,
  );

  if (!site) {
    return {
      error:
        "O local da câmera não foi encontrado.",
    } as const;
  }

  return {
    user,
    organization,
    supabase,
    camera: {
      id: String(camera.id),
      name: String(camera.name),
      description: String(
        camera.description ?? "",
      ),
      monitoringGoals: Array.isArray(
        camera.monitoring_goals,
      )
        ? camera.monitoring_goals.map(
            (goal: unknown) => String(goal),
          )
        : [],
      status: String(camera.status),
      siteName: String(site.name),
      timezone: String(site.timezone),
    },
  } as const;
}

async function loadSourceAsset(
  authorized: Exclude<
    Awaited<ReturnType<typeof authorizeCamera>>,
    { error: string }
  >,
  cameraId: string,
  requestedAssetId: string,
) {
  let query = authorized.supabase
    .from("storage_assets")
    .select(
      "id,bucket,storage_path,kind,mime_type,byte_size,captured_at,width,height",
    )
    .eq(
      "organization_id",
      authorized.organization.id,
    )
    .eq("camera_id", cameraId)
    .eq("status", "ready")
    .is("deleted_at", null)
    .in("kind", [
      "analysis_frame",
      "event_keyframe",
    ]);

  query = IdSchema.safeParse(
    requestedAssetId,
  ).success
    ? query.eq("id", requestedAssetId)
    : query
        .order("captured_at", {
          ascending: false,
        })
        .limit(1);

  const { data: rows, error } = await query;
  const asset = rows?.[0];

  if (error || !asset) {
    return {
      error:
        "A imagem selecionada não está mais disponível.",
    } as const;
  }

  if (String(asset.mime_type) !== "image/jpeg") {
    return {
      error:
        "A imagem selecionada não está no formato JPEG.",
    } as const;
  }

  const declaredSize = Number(
    asset.byte_size ?? 0,
  );

  if (
    declaredSize < 1024 ||
    declaredSize > 5 * 1024 * 1024
  ) {
    return {
      error:
        "A imagem selecionada tem tamanho inválido.",
    } as const;
  }

  return { asset } as const;
}

async function createDraft(
  authorized: Exclude<
    Awaited<ReturnType<typeof authorizeCamera>>,
    { error: string }
  >,
  input: {
    cameraId: string;
    sourceAssetId: string;
    environmentDescription: string;
    monitoringGoals: string[];
    ignoreInstructions: string[];
    zones: Array<{
      name: string;
      type: string;
      personRoleHint: string;
      description: string;
      polygon: Array<{
        x: number;
        y: number;
      }>;
    }>;
    provider: string | null;
    model: string | null;
    responseId: string | null;
    metadata: Record<string, unknown>;
  },
) {
  const zones = input.zones.map(
    (zone, index) => ({
      ...zone,
      sortOrder: index,
    }),
  );

  const { data, error } =
    await authorized.supabase.rpc(
      "create_camera_profile_draft",
      {
        p_organization_id:
          authorized.organization.id,
        p_camera_id: input.cameraId,
        p_source_asset_id:
          input.sourceAssetId,
        p_environment_description:
          input.environmentDescription,
        p_monitoring_goals:
          input.monitoringGoals,
        p_ignore_instructions:
          input.ignoreInstructions,
        p_zones: zones,
        p_provider: input.provider,
        p_model: input.model,
        p_response_id: input.responseId,
        p_profile_metadata: input.metadata,
        p_created_by: authorized.user.id,
      },
    );

  const created = Array.isArray(data)
    ? data[0]
    : data;

  if (error || !created) {
    console.error(
      "Falha ao criar rascunho do perfil:",
      error?.message,
    );
    return null;
  }

  await authorized.supabase
    .from("storage_assets")
    .update({ expires_at: null })
    .eq("id", input.sourceAssetId)
    .eq(
      "organization_id",
      authorized.organization.id,
    );

  return {
    id: String(created.profile_id),
    version: Number(created.profile_version),
  };
}

function revalidateCamera(cameraId: string) {
  revalidatePath(
    `/dashboard/cameras/${cameraId}`,
  );
  revalidatePath("/dashboard/cameras");
  revalidatePath("/dashboard");
}

export async function analyzeCameraProfileAction(
  _previousState: CameraProfileActionState,
  formData: FormData,
): Promise<CameraProfileActionState> {
  const cameraId = String(
    formData.get("camera_id") ?? "",
  );
  const sourceAssetId = String(
    formData.get("source_asset_id") ?? "",
  );
  const userGuidance = String(
    formData.get("user_guidance") ?? "",
  )
    .trim()
    .slice(0, 2000);

  if (!IdSchema.safeParse(cameraId).success) {
    return actionError(
      "Identificador da câmera inválido.",
    );
  }

  const authorized =
    await authorizeCamera(cameraId);

  if ("error" in authorized) {
    return actionError(
      authorized.error ?? "Não foi possível autorizar esta operação.",
    );
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return actionError(
      "A chave OPENAI_API_KEY ainda não está configurada na Vercel.",
    );
  }

  const loaded = await loadSourceAsset(
    authorized,
    cameraId,
    sourceAssetId,
  );

  if ("error" in loaded) {
    return actionError(
      loaded.error ?? "Não foi possível carregar a imagem selecionada.",
    );
  }

  const asset = loaded.asset;

  const { data: file, error: downloadError } =
    await authorized.supabase.storage
      .from(String(asset.bucket))
      .download(String(asset.storage_path));

  if (downloadError || !file) {
    console.error(
      "Falha ao baixar imagem para perfil:",
      downloadError?.message,
    );
    return actionError(
      "Não foi possível carregar a imagem selecionada.",
    );
  }

  const bytes = Buffer.from(
    await file.arrayBuffer(),
  );

  if (
    bytes.length < 1024 ||
    bytes.length > 5 * 1024 * 1024
  ) {
    return actionError(
      "O conteúdo da imagem selecionada é inválido.",
    );
  }

  try {
    const provider = createVisionProvider();

    if (!provider.analyzeCameraProfile) {
      return actionError(
        "O provedor atual não cria perfis de câmera.",
      );
    }

    const analysis =
      await provider.analyzeCameraProfile({
        organizationId:
          authorized.organization.id,
        cameraId,
        cameraName: authorized.camera.name,
        cameraDescription:
          authorized.camera.description,
        siteName: authorized.camera.siteName,
        timezone: authorized.camera.timezone,
        capturedAt: String(
          asset.captured_at ??
            new Date().toISOString(),
        ),
        initialMonitoringGoals:
          authorized.camera.monitoringGoals,
        userGuidance,
        imageUrl: `data:image/jpeg;base64,${bytes.toString(
          "base64",
        )}`,
      });

    const monitoringGoals = uniqueStrings(
      [
        ...authorized.camera.monitoringGoals,
        ...analysis.profile.monitoringGoals,
      ],
      30,
    );

    const ignoreInstructions = uniqueStrings(
      analysis.profile.ignoreInstructions,
      30,
    );

    const created = await createDraft(
      authorized,
      {
        cameraId,
        sourceAssetId: String(asset.id),
        environmentDescription:
          analysis.profile
            .environmentDescription,
        monitoringGoals,
        ignoreInstructions,
        zones: analysis.profile.zones.map(
          (
            zone: CameraProfileDraft["zones"][number],
          ) => ({
            name: zone.name,
            type: zone.type,
            personRoleHint:
              zone.personRoleHint,
            description: zone.description,
            polygon: zone.polygon,
          }),
        ),
        provider: analysis.provider,
        model: analysis.model,
        responseId: analysis.responseId,
        metadata: {
          operationalContext:
            analysis.profile.operationalContext,
          sceneType:
            analysis.profile.sceneType,
          fixedElements:
            analysis.profile.fixedElements,
          privacyNotes:
            analysis.profile.privacyNotes,
          imageQuality:
            analysis.profile.imageQuality,
          confidence:
            analysis.profile.confidence,
          sourceCapturedAt: String(
            asset.captured_at ?? "",
          ),
          sourceKind: String(asset.kind),
          userGuidance,
          latencyMs: analysis.latencyMs,
          usage: analysis.usage,
          profileSchemaVersion: "2.1",
        },
      },
    );

    if (!created) {
      return actionError(
        "A análise foi concluída, mas o perfil não pôde ser salvo.",
      );
    }

    const cost =
      estimateVisionCostBreakdown(
        analysis.model,
        analysis.usage,
      );

    const { error: usageError } =
      await authorized.supabase
        .from("usage_events")
        .insert({
          organization_id:
            authorized.organization.id,
          camera_id: cameraId,
          analysis_job_id: null,
          provider: analysis.provider,
          model: analysis.model,
          input_tokens:
            analysis.usage.inputTokens,
          cached_input_tokens:
            analysis.usage.cachedInputTokens,
          output_tokens:
            analysis.usage.outputTokens,
          reasoning_tokens:
            analysis.usage.reasoningTokens,
          estimated_cost_usd:
            cost.totalCostUsd,
          pricing: cost.rates,
          metadata: {
            purpose: "camera_profile_v2",
            profile_id: created.id,
            profile_version:
              created.version,
            response_id:
              analysis.responseId,
            latency_ms:
              analysis.latencyMs,
            source_asset_id:
              String(asset.id),
            user_guidance:
              userGuidance,
            operational_context:
              analysis.profile.operationalContext,
            cost_breakdown: cost,
          },
        });

    if (usageError) {
      console.error(
        "Falha ao registrar custo do perfil:",
        usageError.message,
      );
    }

    await authorized.supabase
      .from("audit_logs")
      .insert({
        organization_id:
          authorized.organization.id,
        actor_user_id: authorized.user.id,
        action:
          "camera.profile_generated",
        entity_type: "camera_profile",
        entity_id: created.id,
        metadata: {
          camera_id: cameraId,
          version: created.version,
          source_asset_id:
            String(asset.id),
          source_kind:
            String(asset.kind),
          operational_context:
            analysis.profile.operationalContext,
          has_user_guidance:
            Boolean(userGuidance),
        },
      });

    revalidateCamera(cameraId);

    return {
      status: "success",
      message: `Perfil v${created.version} criado com a imagem selecionada. Revise ou edite antes de aprovar.`,
      profileId: created.id,
    };
  } catch (error) {
    console.error(
      "Falha na análise do perfil:",
      error,
    );

    return actionError(
      "A IA não conseguiu criar o perfil agora. Verifique a chave, o saldo e tente novamente.",
    );
  }
}

export async function saveCameraProfileDraftAction(
  _previousState: CameraProfileActionState,
  formData: FormData,
): Promise<CameraProfileActionState> {
  const cameraId = String(
    formData.get("camera_id") ?? "",
  );
  const sourceAssetId = String(
    formData.get("source_asset_id") ?? "",
  );
  const rawPayload = String(
    formData.get("profile_payload") ?? "",
  );

  if (
    !IdSchema.safeParse(cameraId).success ||
    !IdSchema.safeParse(
      sourceAssetId,
    ).success
  ) {
    return actionError(
      "Câmera ou imagem de referência inválida.",
    );
  }

  let json: unknown;

  try {
    json = JSON.parse(rawPayload);
  } catch {
    return actionError(
      "Os ajustes do perfil não estão em um formato válido.",
    );
  }

  const parsed =
    ManualProfileSchema.safeParse(json);

  if (!parsed.success) {
    console.error(
      "Perfil manual rejeitado:",
      parsed.error.issues,
    );
    return actionError(
      "Revise o contexto, a descrição, os objetivos e as zonas antes de salvar.",
    );
  }

  const authorized =
    await authorizeCamera(cameraId);

  if ("error" in authorized) {
    return actionError(
      authorized.error ?? "Não foi possível autorizar esta operação.",
    );
  }

  const loaded = await loadSourceAsset(
    authorized,
    cameraId,
    sourceAssetId,
  );

  if ("error" in loaded) {
    return actionError(
      loaded.error ?? "Não foi possível carregar a imagem selecionada.",
    );
  }

  const input = parsed.data;

  const created = await createDraft(
    authorized,
    {
      cameraId,
      sourceAssetId,
      environmentDescription:
        input.environmentDescription,
      monitoringGoals: uniqueStrings(
        input.monitoringGoals,
        30,
      ),
      ignoreInstructions: uniqueStrings(
        input.ignoreInstructions,
        30,
      ),
      zones: input.zones,
      provider: "manual",
      model: null,
      responseId: null,
      metadata: {
        operationalContext:
          input.operationalContext,
        sceneType: input.sceneType,
        fixedElements:
          input.fixedElements,
        privacyNotes:
          input.privacyNotes,
        imageQuality:
          input.imageQuality,
        confidence: input.confidence,
        manualEdits: true,
        basedOnProfileId:
          input.basedOnProfileId,
        sourceKind: String(
          loaded.asset.kind,
        ),
        profileSchemaVersion: "2.1",
      },
    },
  );

  if (!created) {
    return actionError(
      "Não foi possível salvar a nova versão do perfil.",
    );
  }

  await authorized.supabase
    .from("audit_logs")
    .insert({
      organization_id:
        authorized.organization.id,
      actor_user_id: authorized.user.id,
      action:
        "camera.profile_manually_edited",
      entity_type: "camera_profile",
      entity_id: created.id,
      metadata: {
        camera_id: cameraId,
        version: created.version,
        operational_context:
          input.operationalContext,
        based_on_profile_id:
          input.basedOnProfileId,
        source_asset_id:
          sourceAssetId,
        zones: input.zones.length,
      },
    });

  revalidateCamera(cameraId);

  return {
    status: "success",
    message: `Ajustes salvos como perfil v${created.version}. Aprove a nova versão para colocá-la em produção.`,
    profileId: created.id,
  };
}

export async function approveCameraProfileAction(
  _previousState: CameraProfileActionState,
  formData: FormData,
): Promise<CameraProfileActionState> {
  const cameraId = String(
    formData.get("camera_id") ?? "",
  );
  const profileId = String(
    formData.get("profile_id") ?? "",
  );

  if (
    !IdSchema.safeParse(cameraId).success ||
    !IdSchema.safeParse(
      profileId,
    ).success
  ) {
    return actionError(
      "Perfil ou câmera inválidos.",
    );
  }

  const authorized =
    await authorizeCamera(cameraId);

  if ("error" in authorized) {
    return actionError(
      authorized.error ?? "Não foi possível autorizar esta operação.",
    );
  }

  const { data: profile, error } =
    await authorized.supabase
      .from("camera_profiles")
      .select(
        "id,version,camera_id,is_active",
      )
      .eq("id", profileId)
      .eq("camera_id", cameraId)
      .eq(
        "organization_id",
        authorized.organization.id,
      )
      .maybeSingle();

  if (error || !profile) {
    return actionError(
      "O perfil não foi encontrado.",
    );
  }

  if (profile.is_active) {
    return {
      status: "success",
      message: `O perfil v${Number(
        profile.version,
      )} já está ativo.`,
      profileId,
    };
  }

  const { data: activated, error: activateError } =
    await authorized.supabase.rpc(
      "activate_camera_profile",
      {
        p_organization_id:
          authorized.organization.id,
        p_profile_id: profileId,
        p_reviewed_by:
          authorized.user.id,
      },
    );

  const result = Array.isArray(activated)
    ? activated[0]
    : activated;

  if (activateError || !result) {
    console.error(
      "Falha ao ativar perfil:",
      activateError?.message,
    );
    return actionError(
      "Não foi possível ativar o perfil.",
    );
  }

  await authorized.supabase
    .from("audit_logs")
    .insert({
      organization_id:
        authorized.organization.id,
      actor_user_id: authorized.user.id,
      action:
        "camera.profile_activated",
      entity_type: "camera_profile",
      entity_id: profileId,
      metadata: {
        camera_id: cameraId,
        version: Number(
          result.active_version,
        ),
      },
    });

  revalidateCamera(cameraId);

  return {
    status: "success",
    message: `Perfil v${Number(
      result.active_version,
    )} ativado. O Agent sincronizará a nova configuração.`,
    profileId,
  };
}

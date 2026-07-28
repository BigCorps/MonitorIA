import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

export type ProfilePoint = {
  x: number;
  y: number;
};

export type CameraProfileZoneSummary = {
  id: string;
  name: string;
  type: string;
  description: string;
  polygon: ProfilePoint[];
};

export type CameraProfileSummary = {
  id: string;
  version: number;
  environmentDescription: string;
  monitoringGoals: string[];
  ignoreInstructions: string[];
  isActive: boolean;
  provider: string | null;
  model: string | null;
  sourceAssetId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  sceneType: string;
  fixedElements: string[];
  privacyNotes: string[];
  imageQuality: {
    overall: string;
    lighting: string;
    visibility: string;
    limitations: string[];
  } | null;
  confidence: number | null;
  zones: CameraProfileZoneSummary[];
};

export type CameraProfileFrameSummary = {
  id: string;
  url: string;
  capturedAt: string | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
};

export type CameraProfileWorkspace = {
  latestProfile: CameraProfileSummary | null;
  activeProfileVersion: number | null;
  historyCount: number;
  frame: CameraProfileFrameSummary | null;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function polygonValue(value: unknown): ProfilePoint[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((point) => {
    const object = objectValue(point);
    const x = Number(object.x);
    const y = Number(object.y);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      x > 1 ||
      y < 0 ||
      y > 1
    ) {
      return [];
    }

    return [{ x, y }];
  });
}

function imageQualityValue(value: unknown) {
  const object = objectValue(value);
  if (!Object.keys(object).length) return null;

  return {
    overall: String(object.overall ?? "unknown"),
    lighting: String(object.lighting ?? ""),
    visibility: String(object.visibility ?? ""),
    limitations: stringArray(object.limitations),
  };
}

export async function getCameraProfileWorkspace(
  organizationId: string,
  cameraId: string,
): Promise<CameraProfileWorkspace> {
  const supabase = await createClient();

  const { data: profileRows, error: profilesError } = await supabase
    .from("camera_profiles")
    .select(`
      id,
      version,
      environment_description,
      monitoring_goals,
      ignore_instructions,
      is_active,
      provider,
      model,
      source_asset_id,
      profile_metadata,
      created_at,
      reviewed_at
    `)
    .eq("organization_id", organizationId)
    .eq("camera_id", cameraId)
    .order("version", { ascending: false })
    .limit(20);

  if (profilesError) {
    console.error("Falha ao carregar perfis da câmera:", profilesError.message);
  }

  const profiles = profileRows ?? [];
  const profileIds = profiles.map((profile: any) => String(profile.id));

  const zonesResult = profileIds.length
    ? await supabase
        .from("camera_zones")
        .select("id,camera_profile_id,name,zone_type,polygon,description,sort_order")
        .eq("organization_id", organizationId)
        .in("camera_profile_id", profileIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };

  if (zonesResult.error) {
    console.error("Falha ao carregar zonas da câmera:", zonesResult.error.message);
  }

  const zonesByProfile = new Map<string, CameraProfileZoneSummary[]>();
  for (const zone of zonesResult.data ?? []) {
    const profileId = String((zone as any).camera_profile_id);
    const list = zonesByProfile.get(profileId) ?? [];
    list.push({
      id: String((zone as any).id),
      name: String((zone as any).name),
      type: String((zone as any).zone_type),
      description: String((zone as any).description ?? ""),
      polygon: polygonValue((zone as any).polygon),
    });
    zonesByProfile.set(profileId, list);
  }

  const mappedProfiles: CameraProfileSummary[] = profiles.map((row: any) => {
    const metadata = objectValue(row.profile_metadata);
    const confidence = Number(metadata.confidence);

    return {
      id: String(row.id),
      version: Number(row.version),
      environmentDescription: String(row.environment_description),
      monitoringGoals: stringArray(row.monitoring_goals),
      ignoreInstructions: stringArray(row.ignore_instructions),
      isActive: Boolean(row.is_active),
      provider: row.provider ? String(row.provider) : null,
      model: row.model ? String(row.model) : null,
      sourceAssetId: row.source_asset_id ? String(row.source_asset_id) : null,
      createdAt: String(row.created_at),
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      sceneType: String(metadata.sceneType ?? "unknown"),
      fixedElements: stringArray(metadata.fixedElements),
      privacyNotes: stringArray(metadata.privacyNotes),
      imageQuality: imageQualityValue(metadata.imageQuality),
      confidence: Number.isFinite(confidence) ? confidence : null,
      zones: zonesByProfile.get(String(row.id)) ?? [],
    };
  });

  const latestProfile = mappedProfiles[0] ?? null;
  const activeProfile =
    mappedProfiles.find((profile) => profile.isActive) ?? null;

  let assetQuery = supabase
    .from("storage_assets")
    .select("id,bucket,storage_path,captured_at,width,height,byte_size")
    .eq("organization_id", organizationId)
    .eq("camera_id", cameraId)
    .eq("kind", "analysis_frame")
    .eq("status", "ready")
    .is("deleted_at", null);

  if (latestProfile?.sourceAssetId) {
    assetQuery = assetQuery.eq("id", latestProfile.sourceAssetId);
  } else {
    assetQuery = assetQuery.order("captured_at", { ascending: false }).limit(1);
  }

  const { data: assetRows, error: assetError } = await assetQuery;
  if (assetError) {
    console.error("Falha ao carregar frame de referência:", assetError.message);
  }

  const asset = assetRows?.[0] as any | undefined;
  let frame: CameraProfileFrameSummary | null = null;

  if (asset) {
    const admin = createAdminClient();
    const { data: signed, error: signedError } = await admin.storage
      .from(String(asset.bucket))
      .createSignedUrl(String(asset.storage_path), 15 * 60);

    if (signedError) {
      console.error("Falha ao assinar frame de referência:", signedError.message);
    } else if (signed?.signedUrl) {
      frame = {
        id: String(asset.id),
        url: signed.signedUrl,
        capturedAt: asset.captured_at ? String(asset.captured_at) : null,
        width: asset.width === null ? null : Number(asset.width),
        height: asset.height === null ? null : Number(asset.height),
        byteSize: asset.byte_size === null ? null : Number(asset.byte_size),
      };
    }
  }

  return {
    latestProfile,
    activeProfileVersion: activeProfile?.version ?? null,
    historyCount: mappedProfiles.length,
    frame,
  };
}

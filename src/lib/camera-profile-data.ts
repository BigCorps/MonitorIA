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
  personRoleHint: string;
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
  kind: string;
  capturedAt: string | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  isCurrentSource: boolean;
};

export type CameraProfileWorkspace = {
  latestProfile: CameraProfileSummary | null;
  activeProfileVersion: number | null;
  historyCount: number;
  frame: CameraProfileFrameSummary | null;
  referenceFrames: CameraProfileFrameSummary[];
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => String(item).trim())
        .filter(Boolean)
    : [];
}

function objectValue(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
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

async function signFrames(
  assets: any[],
  currentSourceAssetId: string | null,
): Promise<CameraProfileFrameSummary[]> {
  const admin = createAdminClient();

  const signed = await Promise.all(
    assets.map(async (asset) => {
      const result = await admin.storage
        .from(String(asset.bucket))
        .createSignedUrl(
          String(asset.storage_path),
          20 * 60,
        );

      if (result.error || !result.data?.signedUrl) {
        console.error(
          "Falha ao assinar frame de referência:",
          result.error?.message,
        );
        return null;
      }

      return {
        id: String(asset.id),
        url: result.data.signedUrl,
        kind: String(asset.kind),
        capturedAt: asset.captured_at
          ? String(asset.captured_at)
          : null,
        width:
          asset.width === null
            ? null
            : Number(asset.width),
        height:
          asset.height === null
            ? null
            : Number(asset.height),
        byteSize:
          asset.byte_size === null
            ? null
            : Number(asset.byte_size),
        isCurrentSource:
          String(asset.id) === currentSourceAssetId,
      } satisfies CameraProfileFrameSummary;
    }),
  );

  return signed.filter(
    (
      item,
    ): item is CameraProfileFrameSummary =>
      item !== null,
  );
}

export async function getCameraProfileWorkspace(
  organizationId: string,
  cameraId: string,
): Promise<CameraProfileWorkspace> {
  const supabase = await createClient();

  const { data: profileRows, error: profilesError } =
    await supabase
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
    console.error(
      "Falha ao carregar perfis da câmera:",
      profilesError.message,
    );
  }

  const profiles = profileRows ?? [];
  const profileIds = profiles.map((profile: any) =>
    String(profile.id),
  );

  const zonesResult = profileIds.length
    ? await supabase
        .from("camera_zones")
        .select(
          "id,camera_profile_id,name,zone_type,person_role_hint,polygon,description,sort_order",
        )
        .eq("organization_id", organizationId)
        .in("camera_profile_id", profileIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };

  if (zonesResult.error) {
    console.error(
      "Falha ao carregar zonas da câmera:",
      zonesResult.error.message,
    );
  }

  const zonesByProfile = new Map<
    string,
    CameraProfileZoneSummary[]
  >();

  for (const zone of zonesResult.data ?? []) {
    const profileId = String(
      (zone as any).camera_profile_id,
    );
    const list = zonesByProfile.get(profileId) ?? [];

    list.push({
      id: String((zone as any).id),
      name: String((zone as any).name),
      type: String((zone as any).zone_type),
      personRoleHint: String(
        (zone as any).person_role_hint ?? "none",
      ),
      description: String(
        (zone as any).description ?? "",
      ),
      polygon: polygonValue((zone as any).polygon),
    });

    zonesByProfile.set(profileId, list);
  }

  const mappedProfiles: CameraProfileSummary[] =
    profiles.map((row: any) => {
      const metadata = objectValue(
        row.profile_metadata,
      );
      const confidence = Number(metadata.confidence);

      return {
        id: String(row.id),
        version: Number(row.version),
        environmentDescription: String(
          row.environment_description,
        ),
        monitoringGoals: stringArray(
          row.monitoring_goals,
        ),
        ignoreInstructions: stringArray(
          row.ignore_instructions,
        ),
        isActive: Boolean(row.is_active),
        provider: row.provider
          ? String(row.provider)
          : null,
        model: row.model ? String(row.model) : null,
        sourceAssetId: row.source_asset_id
          ? String(row.source_asset_id)
          : null,
        createdAt: String(row.created_at),
        reviewedAt: row.reviewed_at
          ? String(row.reviewed_at)
          : null,
        sceneType: String(
          metadata.sceneType ?? "unknown",
        ),
        fixedElements: stringArray(
          metadata.fixedElements,
        ),
        privacyNotes: stringArray(
          metadata.privacyNotes,
        ),
        imageQuality: imageQualityValue(
          metadata.imageQuality,
        ),
        confidence: Number.isFinite(confidence)
          ? confidence
          : null,
        zones:
          zonesByProfile.get(String(row.id)) ?? [],
      };
    });

  const latestProfile = mappedProfiles[0] ?? null;
  const activeProfile =
    mappedProfiles.find(
      (profile) => profile.isActive,
    ) ?? null;
  const sourceAssetId =
    latestProfile?.sourceAssetId ?? null;

  const { data: assets, error: assetsError } =
    await supabase
      .from("storage_assets")
      .select(
        "id,bucket,storage_path,kind,captured_at,width,height,byte_size",
      )
      .eq("organization_id", organizationId)
      .eq("camera_id", cameraId)
      .eq("status", "ready")
      .is("deleted_at", null)
      .in("kind", [
        "analysis_frame",
        "event_keyframe",
      ])
      .order("captured_at", { ascending: false })
      .limit(24);

  if (assetsError) {
    console.error(
      "Falha ao carregar galeria de referência:",
      assetsError.message,
    );
  }

  const orderedAssets = [...(assets ?? [])].sort(
    (left: any, right: any) => {
      if (String(left.id) === sourceAssetId) return -1;
      if (String(right.id) === sourceAssetId) return 1;
      return (
        new Date(
          String(right.captured_at ?? 0),
        ).getTime() -
        new Date(
          String(left.captured_at ?? 0),
        ).getTime()
      );
    },
  );

  const referenceFrames = await signFrames(
    orderedAssets,
    sourceAssetId,
  );

  return {
    latestProfile,
    activeProfileVersion:
      activeProfile?.version ?? null,
    historyCount: mappedProfiles.length,
    frame:
      referenceFrames.find(
        (item) => item.isCurrentSource,
      ) ??
      referenceFrames[0] ??
      null,
    referenceFrames,
  };
}

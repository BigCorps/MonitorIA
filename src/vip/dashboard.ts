import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

export type VipDashboardProject = {
  id: string;
  name: string;
  companyName: string;
  projectKind: string;
  planCode: string;
  billingCycle: string | null;
  contractedCameras: number;
  activeCameras: number;
  remainingCapacity: number;
  activeSites: number;
  enabledFeatures: number;
  periodEnd: string | null;
};

export type VipDashboardSummary = {
  projects: VipDashboardProject[];
  projectsCount: number;
  contractedCameras: number;
  activeCameras: number;
  remainingCapacity: number;
  activeSites: number;
  events24h: number;
  agentsOnline: number;
  assistantRemaining: number | null;
};

export type VipProjectWorkspace = {
  project: {
    id: string;
    name: string;
    companyName: string;
    projectKind: string;
    objective: string | null;
    planCode: string;
    billingCycle: string | null;
  };
  contract: {
    id: string;
    status: string;
    contractedCameras: number;
    includedCameras: number;
    excessCameras: number;
    periodStart: string | null;
    periodEnd: string | null;
  };
  cameras: Array<{
    id: string;
    name: string;
    siteId: string;
    siteName: string;
    status: string;
    sourceKind: string;
  }>;
  eligibleCameras: Array<{
    id: string;
    name: string;
    siteName: string;
    sourceKind: string;
  }>;
  sites: Array<{
    id: string;
    name: string;
    timezone: string;
    cameraCount: number;
  }>;
  members: Array<{
    userId: string;
    role: string;
    email: string | null;
  }>;
  features: Array<{
    code: string;
    displayName: string;
    description: string;
    stage: string;
    enabled: boolean;
    source: string;
  }>;
};

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function getVipDashboardForOrganization(
  organizationId: string,
): Promise<VipDashboardSummary> {
  const admin = createAdminClient();
  const { data: projects, error } = await admin
    .from("vip_projects")
    .select("id,name,company_name,project_kind,selected_plan_code,billing_cycle")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("activated_at", { ascending: false });

  if (error) throw new Error(`vip_dashboard_projects_unavailable:${error.message}`);
  const projectIds = (projects ?? []).map((row) => String(row.id));
  if (!projectIds.length) {
    return {
      projects: [], projectsCount: 0, contractedCameras: 0,
      activeCameras: 0, remainingCapacity: 0, activeSites: 0,
      events24h: 0, agentsOnline: 0, assistantRemaining: null,
    };
  }

  const [contracts, cameras, sites, features, agents, balance] = await Promise.all([
    admin.from("vip_contracts").select("project_id,contracted_camera_count,base_period_end").in("project_id", projectIds).in("status", ["active", "grace_period"]),
    admin.from("vip_project_cameras").select("project_id,camera_id").in("project_id", projectIds).eq("status", "active"),
    admin.from("vip_project_sites").select("project_id,site_id").in("project_id", projectIds).eq("status", "active"),
    admin.from("vip_project_features").select("project_id").in("project_id", projectIds).eq("enabled", true),
    admin.from("agents").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "online"),
    admin.rpc("get_assistant_balance", { p_organization_id: organizationId }),
  ]);

  const dependencyError = contracts.error ?? cameras.error ?? sites.error ?? features.error ?? agents.error;
  if (dependencyError) throw new Error(`vip_dashboard_summary_unavailable:${dependencyError.message}`);

  const contractByProject = new Map((contracts.data ?? []).map((row) => [String(row.project_id), row]));
  const cameraCount = new Map<string, number>();
  const cameraIds: string[] = [];
  for (const row of cameras.data ?? []) {
    const id = String(row.project_id);
    cameraCount.set(id, (cameraCount.get(id) ?? 0) + 1);
    cameraIds.push(String(row.camera_id));
  }
  const siteCount = new Map<string, number>();
  for (const row of sites.data ?? []) {
    const id = String(row.project_id);
    siteCount.set(id, (siteCount.get(id) ?? 0) + 1);
  }
  const featureCount = new Map<string, number>();
  for (const row of features.data ?? []) {
    const id = String(row.project_id);
    featureCount.set(id, (featureCount.get(id) ?? 0) + 1);
  }

  let events24h = 0;
  if (cameraIds.length) {
    const eventResult = await admin
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("camera_id", [...new Set(cameraIds)])
      .gte("started_at", new Date(Date.now() - 86400000).toISOString())
      .is("deleted_at", null);
    if (!eventResult.error) events24h = eventResult.count ?? 0;
  }

  const mapped: VipDashboardProject[] = (projects ?? []).map((row) => {
    const id = String(row.id);
    const contract = contractByProject.get(id);
    const contracted = num(contract?.contracted_camera_count);
    const active = cameraCount.get(id) ?? 0;
    return {
      id,
      name: String(row.name),
      companyName: String(row.company_name),
      projectKind: String(row.project_kind),
      planCode: String(row.selected_plan_code),
      billingCycle: row.billing_cycle ? String(row.billing_cycle) : null,
      contractedCameras: contracted,
      activeCameras: active,
      remainingCapacity: Math.max(contracted - active, 0),
      activeSites: siteCount.get(id) ?? 0,
      enabledFeatures: featureCount.get(id) ?? 0,
      periodEnd: contract?.base_period_end ? String(contract.base_period_end) : null,
    };
  });

  const assistant = obj(balance.data);
  return {
    projects: mapped,
    projectsCount: mapped.length,
    contractedCameras: mapped.reduce((sum, p) => sum + p.contractedCameras, 0),
    activeCameras: mapped.reduce((sum, p) => sum + p.activeCameras, 0),
    remainingCapacity: mapped.reduce((sum, p) => sum + p.remainingCapacity, 0),
    activeSites: new Set((sites.data ?? []).map((row) => String(row.site_id))).size,
    events24h,
    agentsOnline: agents.count ?? 0,
    assistantRemaining: assistant.totalRemaining == null ? null : num(assistant.totalRemaining),
  };
}

export async function getVipProjectWorkspace(
  organizationId: string,
  projectId: string,
): Promise<VipProjectWorkspace | null> {
  const admin = createAdminClient();
  const { data: project, error: projectError } = await admin
    .from("vip_projects")
    .select("id,name,company_name,project_kind,objective,selected_plan_code,billing_cycle")
    .eq("id", projectId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (projectError) throw new Error(`vip_project_unavailable:${projectError.message}`);
  if (!project) return null;

  const [contract, links, allCameras, allSites, members, catalog, states, allActiveLinks] = await Promise.all([
    admin.from("vip_contracts").select("id,status,contracted_camera_count,included_cameras,excess_camera_count,base_period_start,base_period_end").eq("project_id", projectId).in("status", ["active", "grace_period"]).order("activated_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("vip_project_cameras").select("camera_id,site_id").eq("project_id", projectId).eq("status", "active"),
    admin.from("cameras").select("id,name,site_id,status,source_kind").eq("organization_id", organizationId).order("name"),
    admin.from("sites").select("id,name,timezone").eq("organization_id", organizationId).order("name"),
    admin.from("vip_project_members").select("user_id,role").eq("project_id", projectId).eq("status", "active"),
    admin.from("vip_feature_catalog").select("code,display_name,description,stage").order("sort_order"),
    admin.from("vip_project_features").select("feature_code,enabled,source").eq("project_id", projectId),
    admin.from("vip_project_cameras").select("camera_id").eq("organization_id", organizationId).eq("status", "active"),
  ]);

  const dependencyError = contract.error ?? links.error ?? allCameras.error ?? allSites.error ?? members.error ?? catalog.error ?? states.error ?? allActiveLinks.error;
  if (dependencyError || !contract.data) throw new Error(`vip_project_dependencies_unavailable:${dependencyError?.message ?? "contract_missing"}`);

  const siteById = new Map((allSites.data ?? []).map((site) => [String(site.id), site]));
  const cameraById = new Map((allCameras.data ?? []).map((camera) => [String(camera.id), camera]));
  const cameras = (links.data ?? []).map((link) => {
    const camera = cameraById.get(String(link.camera_id));
    const site = siteById.get(String(link.site_id));
    return {
      id: String(link.camera_id),
      name: String(camera?.name ?? "Câmera"),
      siteId: String(link.site_id),
      siteName: String(site?.name ?? "Local"),
      status: String(camera?.status ?? "unknown"),
      sourceKind: String(camera?.source_kind ?? "live_camera"),
    };
  });

  const activeAnywhere = new Set((allActiveLinks.data ?? []).map((row) => String(row.camera_id)));
  const eligibleCameras = (allCameras.data ?? [])
    .filter((camera) => !activeAnywhere.has(String(camera.id)))
    .map((camera) => ({
      id: String(camera.id),
      name: String(camera.name),
      siteName: String(siteById.get(String(camera.site_id))?.name ?? "Local"),
      sourceKind: String(camera.source_kind ?? "live_camera"),
    }));

  const countBySite = new Map<string, number>();
  for (const camera of cameras) countBySite.set(camera.siteId, (countBySite.get(camera.siteId) ?? 0) + 1);

  const projectMembers = [] as VipProjectWorkspace["members"];
  for (const member of members.data ?? []) {
    let email: string | null = null;
    try {
      const { data } = await admin.auth.admin.getUserById(String(member.user_id));
      email = data.user?.email ?? null;
    } catch {}
    projectMembers.push({ userId: String(member.user_id), role: String(member.role), email });
  }

  const featureByCode = new Map((states.data ?? []).map((state) => [String(state.feature_code), state]));
  const features = (catalog.data ?? []).map((feature) => {
    const state = featureByCode.get(String(feature.code));
    return {
      code: String(feature.code),
      displayName: String(feature.display_name),
      description: String(feature.description),
      stage: String(feature.stage),
      enabled: state?.enabled === true,
      source: String(state?.source ?? "catalog_default"),
    };
  });

  return {
    project: {
      id: String(project.id), name: String(project.name), companyName: String(project.company_name),
      projectKind: String(project.project_kind), objective: project.objective ? String(project.objective) : null,
      planCode: String(project.selected_plan_code), billingCycle: project.billing_cycle ? String(project.billing_cycle) : null,
    },
    contract: {
      id: String(contract.data.id), status: String(contract.data.status),
      contractedCameras: num(contract.data.contracted_camera_count), includedCameras: num(contract.data.included_cameras),
      excessCameras: num(contract.data.excess_camera_count),
      periodStart: contract.data.base_period_start ? String(contract.data.base_period_start) : null,
      periodEnd: contract.data.base_period_end ? String(contract.data.base_period_end) : null,
    },
    cameras,
    eligibleCameras,
    sites: (allSites.data ?? []).filter((site) => countBySite.has(String(site.id))).map((site) => ({
      id: String(site.id), name: String(site.name), timezone: String(site.timezone), cameraCount: countBySite.get(String(site.id)) ?? 0,
    })),
    members: projectMembers,
    features,
  };
}

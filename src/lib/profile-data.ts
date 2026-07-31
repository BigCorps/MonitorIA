import { createClient } from "@/src/lib/supabase/server";
import {
  getCurrentOrganization,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";

export type ProfileAddress = {
  postalCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

export type ProfileData = {
  user: {
    id: string;
    email: string;
    fullName: string;
    phone: string;
    jobTitle: string;
    createdAt: string | null;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    planCode: string;
    role: string;
    canEdit: boolean;
  };
  company: {
    legalName: string;
    taxId: string;
    phone: string;
    contactEmail: string;
    website: string;
    industry: string;
    logoUrl: string | null;
    tableReady: boolean;
  };
  site: {
    id: string | null;
    name: string;
    timezone: string;
    address: ProfileAddress;
  };
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function addressValue(value: unknown): ProfileAddress {
  const address = objectValue(value);

  return {
    postalCode: stringValue(address.postal_code),
    street: stringValue(address.street),
    number: stringValue(address.number),
    complement: stringValue(address.complement),
    neighborhood: stringValue(address.neighborhood),
    city: stringValue(address.city),
    state: stringValue(address.state),
  };
}

export async function getProfileData(
  userId: string,
): Promise<ProfileData | null> {
  const organization = await getCurrentOrganization(userId);
  if (!organization) return null;

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData.user;
  const metadata = objectValue(authUser?.user_metadata);

  const sites = await getOrganizationSites(organization.id);
  const firstSite = sites[0] ?? null;

  let siteRow:
    | {
        id: string;
        name: string;
        timezone: string;
        address: unknown;
      }
    | null = null;

  if (firstSite) {
    const { data } = await supabase
      .from("sites")
      .select("id,name,timezone,address")
      .eq("organization_id", organization.id)
      .eq("id", firstSite.id)
      .maybeSingle();

    if (data) {
      siteRow = {
        id: String(data.id),
        name: String(data.name),
        timezone: String(data.timezone),
        address: data.address,
      };
    }
  }

  const { data: companyRow, error: companyError } = await supabase
    .from("organization_profiles")
    .select(
      "legal_name,tax_id,phone,contact_email,website,industry,logo_url",
    )
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (
    companyError &&
    companyError.code !== "PGRST205" &&
    companyError.code !== "42P01"
  ) {
    console.error(
      "Falha ao carregar perfil da empresa:",
      companyError.message,
    );
  }

  return {
    user: {
      id: userId,
      email: String(authUser?.email ?? ""),
      fullName: stringValue(metadata.full_name),
      phone: stringValue(metadata.phone),
      jobTitle: stringValue(metadata.job_title),
      createdAt: authUser?.created_at
        ? String(authUser.created_at)
        : null,
    },
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      planCode: organization.planCode,
      role: organization.role,
      canEdit:
        organization.role === "owner" ||
        organization.role === "admin",
    },
    company: {
      legalName: String(companyRow?.legal_name ?? ""),
      taxId: String(companyRow?.tax_id ?? ""),
      phone: String(companyRow?.phone ?? ""),
      contactEmail: String(companyRow?.contact_email ?? ""),
      website: String(companyRow?.website ?? ""),
      industry: String(companyRow?.industry ?? ""),
      logoUrl: companyRow?.logo_url
        ? String(companyRow.logo_url)
        : null,
      tableReady: !companyError,
    },
    site: {
      id: siteRow?.id ?? null,
      name: siteRow?.name ?? firstSite?.name ?? "",
      timezone:
        siteRow?.timezone ??
        firstSite?.timezone ??
        "America/Sao_Paulo",
      address: addressValue(siteRow?.address),
    },
  };
}

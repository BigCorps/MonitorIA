import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

function stringValues(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .map((value) => String(value))
    .filter(Boolean);
}

function clientIdFromDetails(details: any) {
  return String(
    details?.client?.id ??
      details?.client?.client_id ??
      details?.client_id ??
      "",
  );
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const decision = String(formData.get("decision") ?? "deny");
  const authorizationId = String(
    formData.get("authorization_id") ?? "",
  );

  if (!authorizationId) {
    return NextResponse.json(
      { error: "missing_authorization_id" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub
    ? String(claimsData.claims.sub)
    : null;

  if (!userId) {
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );
  }

  const { data: details, error: detailsError } =
    await supabase.auth.oauth.getAuthorizationDetails(
      authorizationId,
    );

  if (detailsError || !details || !("authorization_id" in details)) {
    return NextResponse.json(
      { error: "invalid_authorization_request" },
      { status: 400 },
    );
  }

  if (decision !== "approve") {
    const { data, error } =
      await supabase.auth.oauth.denyAuthorization(authorizationId);
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "deny_failed" },
        { status: 400 },
      );
    }
    return NextResponse.redirect(data.redirect_url, 303);
  }

  const clientId = clientIdFromDetails(details);
  const clientName = String(
    (details as any).client?.name ??
      (details as any).client_name ??
      "Aplicativo MCP",
  );
  const scopes = String((details as any).scope ?? "")
    .split(" ")
    .filter(Boolean);
  const requestedOrganizations = stringValues(
    formData,
    "organization_ids",
  );

  if (!clientId || !requestedOrganizations.length) {
    return NextResponse.json(
      { error: "organization_selection_required" },
      { status: 400 },
    );
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .in("organization_id", requestedOrganizations);

  if (
    membershipError ||
    (memberships ?? []).length !== requestedOrganizations.length
  ) {
    return NextResponse.json(
      { error: "invalid_organization_selection" },
      { status: 403 },
    );
  }

  const { error: revokeError } = await supabase
    .from("mcp_oauth_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .is("revoked_at", null);

  if (revokeError) {
    return NextResponse.json(
      { error: "grant_reset_failed" },
      { status: 500 },
    );
  }

  const { error: grantError } = await supabase
    .from("mcp_oauth_grants")
    .upsert(
      requestedOrganizations.map((organizationId) => ({
        user_id: userId,
        client_id: clientId,
        client_name: clientName,
        organization_id: organizationId,
        approved_scopes: scopes,
        revoked_at: null,
        updated_at: new Date().toISOString(),
      })),
      {
        onConflict: "user_id,client_id,organization_id",
      },
    );

  if (grantError) {
    return NextResponse.json(
      { error: "grant_create_failed" },
      { status: 500 },
    );
  }

  const { data, error } =
    await supabase.auth.oauth.approveAuthorization(authorizationId);

  if (error || !data) {
    await supabase
      .from("mcp_oauth_grants")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("client_id", clientId)
      .in("organization_id", requestedOrganizations)
      .is("revoked_at", null);

    return NextResponse.json(
      { error: error?.message ?? "approval_failed" },
      { status: 400 },
    );
  }

  return NextResponse.redirect(data.redirect_url, 303);
}

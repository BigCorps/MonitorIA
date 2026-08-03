export async function GET(request: Request) {
  const origin =
    process.env.MCP_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
    new URL(request.url).origin;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(
    /\/$/,
    "",
  );

  return Response.json(
    {
      resource: process.env.MCP_RESOURCE_URI?.trim() || `${origin}/mcp`,
      resource_name: "MonitorIA MCP",
      authorization_servers: supabaseUrl
        ? [`${supabaseUrl}/auth/v1`]
        : [],
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid", "email", "profile"],
      resource_documentation: `${origin}/integrations/monitoria-mcp`,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

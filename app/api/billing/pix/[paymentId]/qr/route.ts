import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { createClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ paymentId: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function textResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function monitoriaLogoDataUri() {
  const logoPath = path.join(
    process.cwd(),
    "public",
    "favicon.svg",
  );

  const logo = await readFile(logoPath, "utf8");
  const normalized = logo
    .replace(/<\?xml[^>]*\?>/gi, "")
    .trim();

  return `data:image/svg+xml;base64,${
    Buffer.from(normalized, "utf8").toString("base64")
  }`;
}

async function buildPixQrSvg(payload: string) {
  const size = 360;
  const qrSvg = await QRCode.toString(payload, {
    type: "svg",
    width: size,
    margin: 4,
    errorCorrectionLevel: "H",
    color: {
      dark: "#071a33",
      light: "#ffffff",
    },
  });

  const logoDataUri = await monitoriaLogoDataUri();

  // O símbolo ocupa cerca de 16% do QR. A borda branca protege
  // os módulos centrais e mantém boa leitura em telas menores.
  const logoSize = 58;
  const logoX = (size - logoSize) / 2;
  const logoY = (size - logoSize) / 2;
  const circleRadius = 38;

  const overlay = `
    <circle
      cx="${size / 2}"
      cy="${size / 2}"
      r="${circleRadius}"
      fill="#ffffff"
    />
    <image
      href="${logoDataUri}"
      x="${logoX}"
      y="${logoY}"
      width="${logoSize}"
      height="${logoSize}"
      preserveAspectRatio="xMidYMid meet"
    />
  `;

  return qrSvg.replace("</svg>", `${overlay}</svg>`);
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const { paymentId } = await context.params;

  if (!UUID_PATTERN.test(paymentId)) {
    return textResponse("Pagamento inválido.", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return textResponse("Não autenticado.", 401);
  }

  // A consulta usa o cliente autenticado e respeita a RLS da
  // organização. Um pagamento de outra organização não é exposto.
  const { data: payment, error } = await supabase
    .from("billing_pix_payments")
    .select(
      "id,organization_id,pix_copy_paste,status,expires_at",
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (error) {
    console.error("pix qr payment lookup:", error.message);
    return textResponse(
      "Não foi possível carregar o pagamento.",
      500,
    );
  }

  if (!payment?.pix_copy_paste) {
    return textResponse("Pagamento não encontrado.", 404);
  }

  const payload = String(payment.pix_copy_paste).trim();

  if (!payload || payload.length > 2048) {
    return textResponse("Código Pix inválido.", 422);
  }

  try {
    const svg = await buildPixQrSvg(payload);

    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition":
          `inline; filename="monitoria-pix-${paymentId}.svg"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
      },
    });
  } catch (caught) {
    console.error(
      "pix qr generation:",
      caught instanceof Error
        ? caught.message
        : String(caught),
    );

    return textResponse(
      "Não foi possível gerar o QR Code.",
      500,
    );
  }
}

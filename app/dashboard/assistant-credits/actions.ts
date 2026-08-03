"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";

const PackageSchema = z
  .string()
  .regex(/^assistant_pack_(100|500|2000)$/);

export async function createAssistantCreditInvoiceAction(
  formData: FormData,
) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  if (!new Set(["owner", "admin"]).has(organization.role)) {
    throw new Error("Somente proprietário ou administrador pode comprar pacotes.");
  }

  const packageCode = PackageSchema.parse(formData.get("packageCode"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "create_assistant_credit_invoice",
    {
      p_organization_id: organization.id,
      p_package_code: packageCode,
    },
  );

  if (error) throw new Error(error.message);

  const result = data as Record<string, unknown> | null;
  const invoiceId = String(result?.invoiceId ?? "");
  if (!invoiceId) throw new Error("A fatura não foi criada.");

  redirect(
    `/dashboard/billing?invoice=${encodeURIComponent(invoiceId)}&message=${encodeURIComponent(
      "Pacote preparado. Gere o Pix para concluir a compra.",
    )}`,
  );
}

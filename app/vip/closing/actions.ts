"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import {
  acceptVipProposal,
  getVipProposalForProject,
} from "@/src/vip/proposal";
import { getVipProjectForOrganization } from "@/src/vip/server";
import { VIP_BILLING_CYCLES } from "@/src/vip/types";

function closingRedirect(
  kind: "message" | "error",
  message: string,
): never {
  redirect(`/vip/closing?${kind}=${encodeURIComponent(message)}`);
}

async function customerContext() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  const project = await getVipProjectForOrganization(organization.id);
  if (!project || project.organizationId !== organization.id) {
    redirect("/vip/access");
  }

  if (!["owner", "admin"].includes(organization.role)) {
    closingRedirect(
      "error",
      "Somente proprietários e administradores podem aceitar a proposta VIP.",
    );
  }

  return { user, organization, project };
}

export async function acceptVipProposalAction(formData: FormData) {
  const { user, project } = await customerContext();

  const proposalId = z.string().uuid().safeParse(
    String(formData.get("proposal_id") ?? ""),
  );
  const billingCycle = z.enum(VIP_BILLING_CYCLES).safeParse(
    String(formData.get("billing_cycle") ?? ""),
  );

  if (!proposalId.success || !billingCycle.success) {
    closingRedirect("error", "A proposta selecionada não é válida.");
  }

  const currentProposal = await getVipProposalForProject(project.id);
  if (
    !currentProposal ||
    currentProposal.id !== proposalId.data ||
    currentProposal.status !== "presented"
  ) {
    closingRedirect(
      "error",
      "Esta proposta foi atualizada. Recarregue a página e revise os novos valores.",
    );
  }

  try {
    const result = await acceptVipProposal({
      proposalId: proposalId.data,
      billingCycle: billingCycle.data,
      actorUserId: user.id,
    });

    revalidatePath("/vip/closing");
    revalidatePath("/comercial/vip");

    closingRedirect(
      "message",
      `${result.invoiceNumber || "Cobrança VIP"} preparada. Gere o Pix abaixo para confirmar a contratação.`,
    );
  } catch (error) {
    console.error(
      "Falha ao aceitar proposta VIP:",
      error instanceof Error ? error.message : String(error),
    );
    closingRedirect(
      "error",
      "Não foi possível aceitar a proposta agora. Nenhuma cobrança foi criada.",
    );
  }
}

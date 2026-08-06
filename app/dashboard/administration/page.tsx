import { redirect } from "next/navigation";

export const metadata = { title: "Configurações" };

export default function AdministrationHubPage() {
  redirect("/dashboard/profile");
}

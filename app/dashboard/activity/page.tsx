import { redirect } from "next/navigation";

export const metadata = { title: "Monitoramento" };

export default function ActivityHubPage() {
  redirect("/dashboard/events");
}

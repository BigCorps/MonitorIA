import { redirect } from "next/navigation";
import {
  getAuthenticatedUser,
  normalizeNextPath,
} from "@/src/lib/auth";
import { MfaChallenge } from "./mfa-challenge";

export const metadata = {
  title: "Verificação em duas etapas",
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
};

export default async function MfaPage({
  searchParams,
}: Props) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const next = normalizeNextPath(
    typeof params.next === "string"
      ? params.next
      : "/dashboard",
  );

  return (
    <MfaChallenge
      next={next}
      email={user.email ?? ""}
    />
  );
}

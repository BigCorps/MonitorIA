import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  return NextResponse.redirect(new URL("/login?message=Sess%C3%A3o%20encerrada.", request.url), { status: 302 });
}

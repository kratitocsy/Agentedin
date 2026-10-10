"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { decideApproval, EngineError } from "@/lib/engine/service";
import { createClient } from "@/lib/supabase/server";

const MESSAGES: Record<string, string> = {
  already_decided: "That decision was already made or has expired.",
  invalid_stage: "That step is no longer available.",
  not_owner: "You cannot decide that.",
};

export async function decide(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const id = z.string().uuid().safeParse(formData.get("id"));
  const approve = formData.get("decision") === "approve";
  if (!id.success) redirect("/approvals?error=" + encodeURIComponent("Invalid request"));
  try {
    // Only the signed-in owner can decide. This is the one place approvals are decided for developers.
    await decideApproval({ humanId: user.id }, id.data!, approve);
  } catch (e) {
    const code = e instanceof EngineError ? e.code : "internal";
    redirect("/approvals?error=" + encodeURIComponent(MESSAGES[code] ?? "Something went wrong. Please try again."));
  }
  revalidatePath("/approvals");
}

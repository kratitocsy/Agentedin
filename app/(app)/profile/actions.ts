"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { petName } from "@/lib/validation";

const selfReported = z.object({
  source: z.enum(["leetcode", "resume"]),
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().max(1000).optional(),
});

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return { supabase, user };
}

const fail = (msg: string): never => redirect(`/profile?error=${encodeURIComponent(msg)}`);

export async function renameAgent(formData: FormData) {
  const { user } = await requireUser();
  const parsed = petName.safeParse(formData.get("pet_name"));
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  // Written via the server (session already verified above); only pet_name may change, never trust_level.
  const { error } = await createAdminClient().from("agents").update({ pet_name: parsed.data }).eq("human_id", user.id);
  if (error) return fail("Could not rename your agent");
  await audit({ actor: "human", humanId: user.id, action: "agent.renamed", entity: "agent", details: { pet_name: parsed.data } });
  revalidatePath("/profile");
}

export async function shuffleAvatar() {
  const { user } = await requireUser();
  const { error } = await createAdminClient().from("agents").update({ avatar_seed: randomBytes(8).toString("hex") }).eq("human_id", user.id);
  if (error) return fail("Could not change your avatar");
  await audit({ actor: "human", humanId: user.id, action: "agent.avatar_changed", entity: "agent" });
  revalidatePath("/profile");
}

// Self-reported evidence goes through the user's own client: RLS only allows status = 'self_reported' here.
export async function addSelfReported(formData: FormData) {
  const { supabase, user } = await requireUser();
  const parsed = selfReported.safeParse({
    source: formData.get("source"),
    title: formData.get("title"),
    summary: formData.get("summary") || undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { data, error } = await supabase
    .from("evidence")
    .insert({
      human_id: user.id,
      kind: parsed.data.source === "resume" ? "resume" : "rating",
      title: parsed.data.title,
      summary: parsed.data.summary ?? null,
      source: parsed.data.source,
      status: "self_reported",
    })
    .select("id")
    .single();
  if (error) return fail("Could not save that entry");
  await audit({ actor: "human", humanId: user.id, action: "evidence.added", entity: "evidence", entityId: data.id, details: { source: parsed.data.source, status: "self_reported" } });
  revalidatePath("/profile");
}

export async function deleteEvidence(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return fail("Invalid entry");
  const { error } = await supabase.from("evidence").delete().eq("id", id.data);
  if (error) return fail("Could not remove that entry");
  await audit({ actor: "human", humanId: user.id, action: "evidence.deleted", entity: "evidence", entityId: id.data });
  revalidatePath("/profile");
}

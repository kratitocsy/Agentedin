"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { codeAppearsOn, fetchCfUser, isValidHandle, verificationCode } from "@/lib/codeforces";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const back = (qs: string): never => redirect(`/profile/codeforces?${qs}`);

export async function startCodeforces(formData: FormData) {
  const handle = String(formData.get("handle") ?? "").trim();
  if (!isValidHandle(handle)) return back("error=" + encodeURIComponent("Enter a valid Codeforces handle"));
  redirect(`/profile/codeforces?handle=${encodeURIComponent(handle)}`);
}

export async function verifyCodeforces(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const handle = String(formData.get("handle") ?? "").trim();
  if (!isValidHandle(handle)) return back("error=" + encodeURIComponent("Invalid handle"));
  const q = `handle=${encodeURIComponent(handle)}&error=`;

  const cf = await fetchCfUser(handle).catch(() => null);
  if (!cf) return back(q + encodeURIComponent("Could not reach Codeforces or the handle does not exist. Try again."));
  if (!codeAppearsOn(cf, verificationCode(user.id, handle))) {
    return back(q + encodeURIComponent("Code not found on your Codeforces profile yet. Save it there, then verify again."));
  }

  const admin = createAdminClient();
  const key = cf.handle.toLowerCase();

  // One Codeforces handle belongs to one human.
  const { data: existing } = await admin.from("identities").select("human_id").eq("provider", "codeforces").eq("external_id", key).maybeSingle();
  if (existing && existing.human_id !== user.id) return back(q + encodeURIComponent("That handle is already linked to another account."));

  const { error: idErr } = await admin
    .from("identities")
    .upsert({ human_id: user.id, provider: "codeforces", external_id: key, handle: cf.handle, verified: true }, { onConflict: "provider,external_id" });
  if (idErr) return back(q + encodeURIComponent("Could not link your handle"));

  await admin.from("evidence").delete().eq("human_id", user.id).eq("source", "codeforces");
  const rated = typeof cf.rating === "number";
  const { error: evErr } = await admin.from("evidence").insert({
    human_id: user.id,
    kind: "rating",
    title: rated ? `Codeforces ${cf.rank}: ${cf.rating}` : "Codeforces (unrated)",
    summary: rated ? `Max ${cf.maxRank} (${cf.maxRating}). Handle: ${cf.handle}` : `Handle: ${cf.handle}`,
    source: "codeforces",
    status: "verified",
    data: { handle: cf.handle, rating: cf.rating ?? null, maxRating: cf.maxRating ?? null, rank: cf.rank ?? null },
  });
  if (evErr) return back(q + encodeURIComponent("Could not save your rating"));

  await audit({ actor: "human", humanId: user.id, action: "identity.codeforces_verified", entity: "identity", details: { handle: cf.handle } });
  revalidatePath("/profile");
  redirect("/profile");
}

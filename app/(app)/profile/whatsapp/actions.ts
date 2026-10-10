"use server";

import { redirect } from "next/navigation";
import { generateCode } from "@/lib/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const TTL_MINUTES = 15;

export async function startWhatsappVerification() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const admin = createAdminClient();
  const { data: existing } = await admin.from("whatsapp_challenges").select("created_at, expires_at").eq("human_id", user.id).maybeSingle();
  // Reuse a code issued in the last minute; avoids hammering from repeated clicks.
  if (existing && Date.now() - new Date(existing.created_at).getTime() < 60_000 && new Date(existing.expires_at) > new Date()) {
    redirect("/profile/whatsapp");
  }
  const { error } = await admin
    .from("whatsapp_challenges")
    .upsert({ human_id: user.id, code: generateCode(), expires_at: new Date(Date.now() + TTL_MINUTES * 60_000).toISOString(), created_at: new Date().toISOString() }, { onConflict: "human_id" });
  if (error) redirect("/profile/whatsapp?error=" + encodeURIComponent("Could not create a code. Try again."));
  redirect("/profile/whatsapp");
}

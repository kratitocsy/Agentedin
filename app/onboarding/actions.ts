"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { CONSENT_VERSION } from "@/lib/consent";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { avatarSeed, petName } from "@/lib/validation";

const schema = z.object({
  pet_name: petName,
  avatar_seed: avatarSeed,
  consent: z.literal("on", { message: "Please accept the privacy policy to continue" }),
});

export async function completeOnboarding(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const parsed = schema.safeParse({
    pet_name: formData.get("pet_name"),
    avatar_seed: formData.get("avatar_seed"),
    consent: formData.get("consent") ?? undefined,
  });
  if (!parsed.success) redirect(`/onboarding?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const { pet_name, avatar_seed } = parsed.data!;

  // Server-side writes: consent and onboarding state must not be settable from the browser.
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const [a, h] = await Promise.all([
    admin.from("agents").update({ pet_name, avatar_seed }).eq("human_id", user.id),
    admin.from("humans").update({ consent_version: CONSENT_VERSION, consented_at: now, onboarded_at: now }).eq("id", user.id),
  ]);
  if (a.error || h.error) redirect(`/onboarding?error=${encodeURIComponent("Could not save. Please try again.")}`);

  await audit({ actor: "human", humanId: user.id, action: "consent.privacy_accepted", entity: "human", entityId: user.id, details: { version: CONSENT_VERSION } });
  await audit({ actor: "human", humanId: user.id, action: "onboarding.completed", entity: "agent", details: { pet_name } });
  redirect("/profile/github");
}

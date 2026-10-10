"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { endHunt, EngineError, setPrivateLimits, startHunt } from "@/lib/engine/service";
import { createClient } from "@/lib/supabase/server";

const list = (v: FormDataEntryValue | null) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const num = (v: FormDataEntryValue | null) => (String(v ?? "").trim() === "" ? undefined : Number(v));
const back = (msg: string): never => redirect("/hunt?error=" + encodeURIComponent(msg));

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return user.id;
}

export async function begin(formData: FormData) {
  const id = await me();
  if (formData.get("consent") !== "on") back("Please confirm your consent to start a hunt.");
  try {
    // Private limits are stored sealed (never shown to companies, never sent through an AI client).
    const minCtcLakh = num(formData.get("min_ctc_lakh"));
    await setPrivateLimits(id, { minCtc: minCtcLakh ? minCtcLakh * 100_000 : undefined, noticeDays: num(formData.get("notice_days")) });
    await startHunt(id, {
      mode: formData.get("mode") === "inbound" ? "inbound" : "hunting",
      roleTypes: list(formData.get("role_types")),
      places: list(formData.get("places")),
      dailyLimit: num(formData.get("daily_limit")) ?? 3,
      days: num(formData.get("days")) ?? 14,
      blockedDomains: list(formData.get("blocked_domains")),
    });
  } catch (e) {
    if (e instanceof EngineError && e.code === "verify_whatsapp_first") back("Verify your WhatsApp number first (your agent needs trust level 1).");
    if (e instanceof z.ZodError) back(e.issues[0].message);
    back("Could not start the hunt. Check the values and try again.");
  }
  redirect("/hunt");
}

export async function stop() {
  await endHunt(await me());
  redirect("/hunt");
}

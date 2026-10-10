import { signValue } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { nudgeAllowed } from "@/lib/jobs/schedule";

export const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "";
export type SendResult = "sent" | "skipped" | "failed";

// Email through Resend's HTTP API. Without RESEND_API_KEY it reports "skipped", never an error, so jobs still finish.
export async function sendEmail(to: string, subject: string, text: string, headers?: Record<string, string>): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "skipped";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Agentedin <onboarding@resend.dev>", to, subject, text, headers }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export const unsubscribeUrl = (humanId: string) => `${siteUrl()}/api/unsubscribe?u=${humanId}&t=${signValue("unsubscribe", humanId)}`;

export async function humanContact(humanId: string) {
  const { data } = await createAdminClient().from("humans").select("email").eq("id", humanId).single();
  return data?.email ?? null;
}

// Nudges (digests, reminders) obey the proactivity limits; transactional mail (an approval you must act on) does not.
export async function canNudge(humanId: string, kind: string) {
  const { data } = await createAdminClient().from("nudge_counters").select("last_sent_at, paused_until").eq("human_id", humanId).eq("kind", kind).maybeSingle();
  return nudgeAllowed(data, Date.now());
}
export async function recordNudge(humanId: string, kind: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("nudge_counters").select("sent_count").eq("human_id", humanId).eq("kind", kind).maybeSingle();
  await admin.from("nudge_counters").upsert({ human_id: humanId, kind, last_sent_at: new Date().toISOString(), sent_count: (data?.sent_count ?? 0) + 1 }, { onConflict: "human_id,kind" });
}
export async function pauseNudges(humanId: string, kind: string, days: number) {
  await createAdminClient().from("nudge_counters").upsert({ human_id: humanId, kind, paused_until: new Date(Date.now() + days * 86_400_000).toISOString() }, { onConflict: "human_id,kind" });
}

import { createHmac, timingSafeEqual } from "node:crypto";
import type { CandidateCard } from "@/lib/engine/card";
import { decrypt } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Slack signs every request: v0=HMAC_SHA256(signing_secret, "v0:<timestamp>:<raw body>"). Reject stale or forged ones.
export function verifySlackSignature(raw: string, timestamp: string | null, signature: string | null, secret: string, now = Date.now()) {
  if (!timestamp || !signature?.startsWith("v0=")) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false; // replay protection: 5 minutes
  const expected = Buffer.from(createHmac("sha256", secret).update(`v0:${timestamp}:${raw}`).digest("hex"));
  const given = Buffer.from(signature.slice(3));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function slackCall(token: string, method: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  try {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    return (await res.json()) as { ok: boolean; error?: string };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function botFor(companyId: string) {
  const { data } = await createAdminClient().from("slack_installations").select("bot_token_enc, installer_user_id").eq("company_id", companyId).maybeSingle();
  if (!data) return null;
  try {
    return { token: decrypt(data.bot_token_enc, "slack-bot-token"), installerUserId: data.installer_user_id };
  } catch {
    return null; // key changed or data corrupted: treat as not installed rather than crash a job
  }
}

// Posts to the installer's DM with the app (a user id as channel opens that conversation).
export async function notifyCompany(companyId: string, text: string, blocks?: unknown[]) {
  const bot = await botFor(companyId);
  if (!bot) return false;
  const r = await slackCall(bot.token, "chat.postMessage", { channel: bot.installerUserId, text, blocks });
  return r.ok;
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

export function candidateBlocks(card: CandidateCard, roleTitle: string, withButton = true) {
  const skills = card.skills.slice(0, 4).map((s) => `${esc(s.name)} ${s.share}%${s.verified ? " ✓" : ""}`).join(" · ");
  const projects = card.projects.slice(0, 3).map((p) => `• ${esc(p.title)}${p.stack.length ? ` (${esc(p.stack.join(", "))})` : ""}${p.commits ? `, ${p.commits} commits` : ""}`).join("\n");
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `🤖 *${esc(card.agent.name)}* · match ${card.score}/100 · ${card.fit}\nFor: *${esc(roleTitle)}*\n${skills ? `*Verified skills:* ${skills}\n` : ""}${projects}\n_${card.reasons.map(esc).join(" · ")}_` } },
  ];
  if (withButton) {
    blocks.push({ type: "actions", elements: [{ type: "button", style: "primary", text: { type: "plain_text", text: "Request interview" }, action_id: "request_interview", value: card.id }] });
  }
  return blocks;
}

export function approvalBlocks(a: { id: string; summary: string; expires_at: string }) {
  return [
    { type: "section", text: { type: "mrkdwn", text: `*Needs your approval*\n${esc(a.summary)}\n_Expires ${new Date(a.expires_at).toUTCString()}_` } },
    {
      type: "actions",
      elements: [
        { type: "button", style: "primary", text: { type: "plain_text", text: "Approve" }, action_id: "approve", value: a.id },
        { type: "button", text: { type: "plain_text", text: "Decline" }, action_id: "decline", value: a.id },
      ],
    },
  ];
}

// A pipeline entry: the persona card, plus the one action that makes sense at its stage.
export function pipelineBlocks(entry: CandidateCard & { threadId: string; stage: string; identity?: { name: string | null; email: string | null; github: string | null } }, roleTitle: string) {
  const blocks = candidateBlocks(entry, roleTitle, entry.stage === "shortlisted") as { type: string; elements?: unknown[] }[];
  const label: Record<string, string> = {
    shortlisted: "Shortlisted", interview_requested: "⏳ Waiting for the candidate to approve the interview", interview_confirmed: "✅ Interview confirmed",
    offer_proposed: "⏳ Offer sent, waiting for the candidate", offer_accepted: "🎉 Offer accepted",
  };
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `*Stage:* ${label[entry.stage] ?? esc(entry.stage)}` }] });
  if (entry.identity) {
    // Revealed by the candidate's own approval; the database wrote it into this thread only.
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Candidate revealed:* ${esc(entry.identity.name ?? "(no name set)")} · ${esc(entry.identity.email ?? "no email")}${entry.identity.github ? ` · github.com/${esc(entry.identity.github)}` : ""}` } } as never);
  }
  if (entry.stage === "interview_confirmed") {
    blocks.push({ type: "actions", elements: [{ type: "button", style: "primary", text: { type: "plain_text", text: "Propose offer" }, action_id: "propose_offer", value: entry.threadId }] });
  }
  return blocks;
}

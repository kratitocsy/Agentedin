import { createAdminClient } from "@/lib/supabase/admin";
import { expireApprovals, expireHunts, listApprovals, runMatching } from "@/lib/engine/service";
import { canNudge, humanContact, recordNudge, sendEmail, siteUrl, unsubscribeUrl } from "@/lib/notify";
import { approvalBlocks, candidateBlocks, notifyCompany } from "@/lib/slack";
import { companyShortlist } from "@/lib/engine/service";

type Payload = Record<string, unknown>;
export type HandlerResult = "done" | "skipped";

const str = (v: unknown) => (typeof v === "string" ? v : "");

async function threadFacts(threadId: string) {
  const admin = createAdminClient();
  const { data: t } = await admin.from("threads").select("id, human_id, role_id, company_id, stage").eq("id", threadId).single();
  if (!t) return null;
  const [{ data: role }, { data: company }, { data: agent }] = await Promise.all([
    admin.from("roles").select("title").eq("id", t.role_id).single(),
    admin.from("companies").select("name").eq("id", t.company_id).single(),
    admin.from("agents").select("pet_name").eq("human_id", t.human_id).single(),
  ]);
  return { t, role: role?.title ?? "a role", company: company?.name ?? "a company", agent: agent?.pet_name ?? "Your agent" };
}

export const HANDLERS: Record<string, (payload: Payload) => Promise<HandlerResult>> = {
  "approvals.expire": async () => { await expireApprovals(); return "done"; },
  "hunts.expire": async () => { await expireHunts(); return "done"; },
  "matching.run": async () => { await runMatching(); return "done"; },

  // Your agent shared your anonymous card (hunting mode): tell the developer, and the company gets the candidate card in Slack.
  "notify.shortlisted": async (p) => {
    const f = await threadFacts(str(p.threadId));
    if (!f) return "skipped";
    const email = await humanContact(f.t.human_id);
    if (email) {
      await sendEmail(email, `${f.agent} shared your profile with ${f.company}`,
        `Your agent ${f.agent} shared your anonymous profile card with ${f.company} for "${f.role}", within the hunt limits you set.\nYour name and contact stay hidden until you accept an interview.\n\nSee your hunt board: ${siteUrl()}/approvals`);
    }
    const list = await companyShortlist(f.t.company_id, f.t.role_id);
    const card = list.find((c) => c.threadId === f.t.id);
    if (card) await notifyCompany(f.t.company_id, `New candidate for ${f.role}`, candidateBlocks(card, f.role));
    return "done";
  },

  // Something needs a human decision: always delivered (transactional, not a nudge).
  "notify.approval": async (p) => {
    const { data: a } = await createAdminClient().from("approvals").select("id, human_id, company_id, summary, expires_at, status").eq("id", str(p.approvalId)).single();
    if (!a || a.status !== "pending") return "skipped";
    if (a.company_id) {
      await notifyCompany(a.company_id, a.summary, approvalBlocks(a));
    } else if (a.human_id) {
      const email = await humanContact(a.human_id);
      if (email) await sendEmail(email, "A decision is waiting for you on Agentedin", `${a.summary}\n\nReview and decide here: ${siteUrl()}/approvals\nThis expires ${new Date(a.expires_at).toUTCString()}.`);
    }
    return "done";
  },

  "notify.offer": async (p) => {
    const f = await threadFacts(str(p.threadId));
    if (!f) return "skipped";
    const email = await humanContact(f.t.human_id);
    if (email) await sendEmail(email, `You have an offer from ${f.company}`, `${f.company} sent an offer for "${f.role}". Review and decide here: ${siteUrl()}/approvals\n(We never put offer terms in email.)`);
    return "done";
  },

  // Weekly digest: only when there is something to say, and never more than once a day per person.
  "digest.weekly": async () => {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: people } = await admin.from("humans").select("id, email").not("onboarded_at", "is", null).not("email", "is", null).limit(200);
    for (const h of people ?? []) {
      if (!(await canNudge(h.id, "digest"))) continue;
      const [approvals, { count: matches }, { count: threads }] = await Promise.all([
        listApprovals({ humanId: h.id }),
        admin.from("matches").select("id", { count: "exact", head: true }).eq("human_id", h.id).gte("created_at", since),
        admin.from("threads").select("id", { count: "exact", head: true }).eq("human_id", h.id).not("stage", "in", "(declined,closed)"),
      ]);
      if (!approvals.length && !matches && !threads) continue; // nothing worth an email
      const lines = [
        approvals.length ? `• ${approvals.length} decision${approvals.length > 1 ? "s" : ""} waiting for you` : "",
        matches ? `• ${matches} new match${matches > 1 ? "es" : ""} this week` : "",
        threads ? `• ${threads} active conversation${threads > 1 ? "s" : ""}` : "",
      ].filter(Boolean);
      const r = await sendEmail(h.email!, "Your Agentedin week", `Here is your week:\n${lines.join("\n")}\n\nOpen Agentedin: ${siteUrl()}/approvals\n\nStop this digest: ${unsubscribeUrl(h.id)}`, { "List-Unsubscribe": `<${unsubscribeUrl(h.id)}>` });
      if (r === "sent") await recordNudge(h.id, "digest");
    }
    return "done";
  },
};

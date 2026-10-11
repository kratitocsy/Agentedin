// The engine's public surface. Every connector (MCP, Slack, email, web) calls these and nothing else.
// Rule: validation and orchestration live here; every state change that matters is one atomic database function.
import { z } from "zod";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { toCandidateCard, type CandidateCard, type EvidenceRow } from "./card";
import { MIN_SCORE, scoreMatch, type DevEvidence } from "./matching";

export class EngineError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const KNOWN = new Set([
  "match_not_found", "role_not_available", "company_not_approved", "candidate_not_available", "invalid_stage", "thread_not_found",
  "offer_exists", "invalid_package", "approval_not_found", "not_owner", "already_decided",
]);
const fail = (error: { message: string }): never => {
  throw new EngineError(KNOWN.has(error.message) ? error.message : "internal");
};

export type Owner = { humanId: string; companyId?: never } | { companyId: string; humanId?: never };

// ---------------------------------------------------------------- jobs
export async function enqueueJob(kind: string, payload: Record<string, Json> = {}, opts: { dedupeKey?: string; runAt?: Date } = {}) {
  const { error } = await createAdminClient().from("jobs").insert({
    kind, payload, dedupe_key: opts.dedupeKey ?? null, run_at: (opts.runAt ?? new Date()).toISOString(),
  });
  // A duplicate dedupe_key means the same work is already queued, which is exactly what we want.
  if (error && error.code !== "23505") throw new EngineError("internal");
}

// ---------------------------------------------------------------- developer side
const domain = z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Use a domain like example.com");
const huntInput = z.object({
  mode: z.enum(["hunting", "inbound"]).default("hunting"),
  roleTypes: z.array(z.string().trim().min(2).max(40)).max(10).default([]),
  places: z.array(z.string().trim().min(2).max(40)).max(10).default([]),
  dailyLimit: z.number().int().min(1).max(10).default(3),
  days: z.number().int().min(1).max(30).default(14),
  blockedDomains: z.array(domain).max(20).default([]),
});
export type HuntInputRaw = z.input<typeof huntInput>;

export async function startHunt(humanId: string, raw: HuntInputRaw) {
  const input = huntInput.parse(raw);
  const admin = createAdminClient();
  const { data: agent } = await admin.from("agents").select("trust_level").eq("human_id", humanId).single();
  // Level 1 = GitHub + a verified WhatsApp number. Hunting needs it (Wynkogent trust levels).
  if (!agent || agent.trust_level < 1) throw new EngineError("verify_whatsapp_first");

  const expiresAt = new Date(Date.now() + input.days * 86_400_000).toISOString();
  await admin.from("hunts").update({ status: "ended" }).eq("human_id", humanId).eq("status", "active");
  const { data: hunt, error } = await admin
    .from("hunts")
    .insert({ human_id: humanId, mode: input.mode, role_types: input.roleTypes, places: input.places, daily_limit: input.dailyLimit, blocked_domains: input.blockedDomains, expires_at: expiresAt })
    .select("id")
    .single();
  if (error) throw new EngineError("internal");

  // The recorded consent: scoped to role types, places, duration and daily limit, revocable from the privacy center.
  await admin.from("consents").insert({
    human_id: humanId, kind: input.mode === "hunting" ? "hunt_session" : "open_to_inbound", expires_at: expiresAt,
    scope: { roleTypes: input.roleTypes, places: input.places, dailyLimit: input.dailyLimit, mode: input.mode },
  });
  await admin.from("agents").update({ trust_level: 2 }).eq("human_id", humanId).eq("trust_level", 1);
  await audit({ actor: "human", humanId, action: "hunt.started", entity: "hunt", entityId: hunt.id, details: { mode: input.mode, days: input.days } });
  return hunt.id;
}

export async function endHunt(humanId: string) {
  await createAdminClient().from("hunts").update({ status: "ended" }).eq("human_id", humanId).eq("status", "active");
  await audit({ actor: "human", humanId, action: "hunt.ended", entity: "hunt" });
}

const limits = z.object({ minCtc: z.number().positive().max(1e9).optional(), noticeDays: z.number().int().min(0).max(180).optional() });
export async function setPrivateLimits(humanId: string, raw: z.input<typeof limits>) {
  const v = limits.parse(raw);
  const { error } = await createAdminClient()
    .from("developer_private_limits")
    .upsert({ human_id: humanId, min_ctc: v.minCtc ?? null, notice_days: v.noticeDays ?? null }, { onConflict: "human_id" });
  if (error) throw new EngineError("internal");
  // The number itself is deliberately NOT written to the audit log.
  await audit({ actor: "human", humanId, action: "limits.updated", entity: "developer_private_limits" });
}

// ---------------------------------------------------------------- evidence loading
async function loadEvidence(humanIds: string[]) {
  const byHuman = new Map<string, { dev: DevEvidence; rows: EvidenceRow[] }>();
  if (!humanIds.length) return byHuman;
  const { data } = await createAdminClient()
    .from("evidence").select("human_id, kind, title, summary, source, status, data").in("human_id", humanIds).eq("status", "verified").in("kind", ["skill", "project"]);
  for (const id of humanIds) byHuman.set(id, { dev: { skills: [], verifiedProjects: 0 }, rows: [] });
  for (const e of data ?? []) {
    const entry = byHuman.get(e.human_id)!;
    entry.rows.push({ kind: e.kind, title: e.title, summary: e.summary, source: e.source, status: e.status, data: (e.data ?? {}) as Record<string, unknown> });
    if (e.kind === "skill") entry.dev.skills.push({ name: e.title, share: Number((e.data as { share?: number })?.share ?? 0) });
    if (e.kind === "project") entry.dev.verifiedProjects += 1;
  }
  return byHuman;
}

async function activeHunts() {
  const admin = createAdminClient();
  const { data: hunts } = await admin
    .from("hunts").select("id, human_id, mode, role_types, places, blocked_domains").eq("status", "active").gt("expires_at", new Date().toISOString());
  const ids = (hunts ?? []).map((h) => h.human_id);
  if (!ids.length) return [];
  const { data: agents } = await admin.from("agents").select("human_id, pet_name, avatar_seed, trust_level").in("human_id", ids).gte("trust_level", 1);
  const ok = new Map((agents ?? []).map((a) => [a.human_id, a]));
  return (hunts ?? []).filter((h) => ok.has(h.human_id)).map((h) => ({ ...h, agent: ok.get(h.human_id)! }));
}

// ---------------------------------------------------------------- matching (scheduled)
export async function runMatching(opts: { maxPairs?: number } = {}) {
  const admin = createAdminClient();
  const maxPairs = opts.maxPairs ?? 300;
  const [hunts, { data: companies }] = await Promise.all([activeHunts(), admin.from("companies").select("id, domain").eq("status", "approved")]);
  const stats = { pairs: 0, matched: 0, shared: 0 };
  if (!hunts.length || !companies?.length) return stats;

  const domainOf = new Map(companies.map((c) => [c.id, c.domain]));
  const { data: roles } = await admin.from("roles").select("id, company_id, title, skills, locations, remote").eq("status", "open").in("company_id", [...domainOf.keys()]);
  const { data: existing } = await admin.from("matches").select("role_id, human_id").in("human_id", hunts.map((h) => h.human_id));
  const seen = new Set((existing ?? []).map((m) => `${m.role_id}:${m.human_id}`));
  const evidence = await loadEvidence(hunts.map((h) => h.human_id));

  for (const hunt of hunts) {
    for (const role of roles ?? []) {
      if (stats.pairs >= maxPairs) return stats;
      if (seen.has(`${role.id}:${hunt.human_id}`)) continue;
      stats.pairs += 1;
      const r = scoreMatch(evidence.get(hunt.human_id)!.dev, role, { roleTypes: hunt.role_types, places: hunt.places, blockedDomains: hunt.blocked_domains }, domainOf.get(role.company_id)!);
      if (!r.eligible || r.score < MIN_SCORE) continue;
      const { data: matchId, error } = await admin.rpc("engine_create_match", { p_role: role.id, p_human: hunt.human_id, p_score: r.score, p_reasons: r.reasons });
      if (error || !matchId) continue;
      stats.matched += 1;
      if (hunt.mode === "hunting") {
        const { data: threadId } = await admin.rpc("engine_share_match", { p_match: matchId });
        if (threadId) {
          stats.shared += 1;
          await enqueueJob("notify.shortlisted", { threadId }, { dedupeKey: `shortlisted:${threadId}` });
        }
      }
    }
  }
  return stats;
}

// ---------------------------------------------------------------- company side
async function companyRole(companyId: string, roleId: string) {
  const admin = createAdminClient();
  const { data: company } = await admin.from("companies").select("id, name, domain, status").eq("id", companyId).single();
  if (!company || company.status !== "approved") throw new EngineError("company_not_approved");
  const { data: role } = await admin.from("roles").select("id, title, skills, locations, remote, status").eq("id", roleId).eq("company_id", companyId).single();
  if (!role || role.status !== "open") throw new EngineError("role_not_available");
  return { company, role };
}

// On-demand search for a role: anonymous persona cards of developers whose hunt/inbound consent covers this role.
export async function companyFind(companyId: string, roleId: string, limit = 10): Promise<CandidateCard[]> {
  const { company, role } = await companyRole(companyId, roleId);
  const admin = createAdminClient();
  const hunts = await activeHunts();
  const evidence = await loadEvidence(hunts.map((h) => h.human_id));

  const scored = hunts
    .map((h) => ({ h, r: scoreMatch(evidence.get(h.human_id)!.dev, role, { roleTypes: h.role_types, places: h.places, blockedDomains: h.blocked_domains }, company.domain) }))
    .filter((x) => x.r.eligible && x.r.score >= MIN_SCORE)
    .sort((a, b) => b.r.score - a.r.score)
    .slice(0, Math.min(limit, 20));

  const cards: CandidateCard[] = [];
  for (const { h, r } of scored) {
    const { data: matchId } = await admin.rpc("engine_create_match", { p_role: roleId, p_human: h.human_id, p_score: r.score, p_reasons: r.reasons });
    if (!matchId) continue;
    const { data: fit } = await admin.rpc("engine_fit_check", { p_match: matchId });
    if (fit === "no_fit") continue; // never surface a candidate whose sealed minimum exceeds the sealed budget
    cards.push(toCandidateCard({ matchId, score: r.score, reasons: r.reasons, fit: fit ?? "unknown", agent: h.agent, evidence: evidence.get(h.human_id)!.rows }));
  }
  return cards;
}

export type ShortlistEntry = CandidateCard & { threadId: string; roleId: string; stage: string; identity?: { name: string | null; email: string | null; github: string | null; photoUrl: string | null } };

export async function companyShortlist(companyId: string, roleId?: string): Promise<ShortlistEntry[]> {
  const admin = createAdminClient();
  let q = admin.from("threads").select("id, match_id, role_id, human_id, stage").eq("company_id", companyId).not("stage", "in", "(declined,closed)");
  if (roleId) q = q.eq("role_id", roleId);
  const { data: threads } = await q.order("created_at", { ascending: false }).limit(50);
  if (!threads?.length) return [];

  const humanIds = [...new Set(threads.map((t) => t.human_id))];
  const [evidence, { data: agents }, { data: matches }, { data: fits }, { data: reveals }] = await Promise.all([
    loadEvidence(humanIds),
    admin.from("agents").select("human_id, pet_name, avatar_seed").in("human_id", humanIds),
    admin.from("matches").select("id, score, reasons").in("id", threads.map((t) => t.match_id)),
    admin.from("fit_checks").select("match_id, result").in("match_id", threads.map((t) => t.match_id)),
    admin.from("thread_messages").select("thread_id, body").eq("kind", "identity_revealed").in("thread_id", threads.map((t) => t.id)),
  ]);
  const agentOf = new Map((agents ?? []).map((a) => [a.human_id, a]));
  const matchOf = new Map((matches ?? []).map((m) => [m.id, m]));
  const fitOf = new Map((fits ?? []).map((f) => [f.match_id, f.result]));
  const revealOf = new Map((reveals ?? []).map((r) => [r.thread_id, r.body as { name?: string; email?: string; github?: string; photo_url?: string }]));

  return threads.map((t) => {
    const a = agentOf.get(t.human_id)!;
    const m = matchOf.get(t.match_id)!;
    const card = toCandidateCard({ matchId: m.id, score: m.score, reasons: (m.reasons as string[]) ?? [], fit: fitOf.get(t.match_id) ?? "unknown", agent: a, evidence: evidence.get(t.human_id)?.rows ?? [] });
    // Identity appears ONLY after the developer approved the interview; the database wrote the reveal into this thread.
    const rv = revealOf.get(t.id);
    return { ...card, threadId: t.id, roleId: t.role_id, stage: t.stage, identity: rv ? { name: rv.name ?? null, email: rv.email ?? null, github: rv.github ?? null, photoUrl: rv.photo_url ?? null } : undefined };
  });
}

export async function requestInterview(companyId: string, matchId: string) {
  const { data, error } = await createAdminClient().rpc("engine_request_interview", { p_company: companyId, p_match: matchId });
  if (error) fail(error);
  await enqueueJob("notify.approval", { approvalId: data as string }, { dedupeKey: `approval:${data}` });
  return data as string;
}

const offerPackage = z.object({
  title: z.string().trim().min(2).max(120),
  ctc_inr: z.number().positive().max(1e9),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export async function proposeOffer(companyId: string, threadId: string, raw: z.input<typeof offerPackage>) {
  const pkg = offerPackage.parse(raw);
  const { data, error } = await createAdminClient().rpc("engine_propose_offer", { p_company: companyId, p_thread: threadId, p_package: pkg });
  if (error) fail(error);
  return data as string; // an approval id the company's own human must confirm
}

// ---------------------------------------------------------------- approvals (both sides)
export async function listApprovals(owner: Owner) {
  const admin = createAdminClient();
  let q = admin.from("approvals").select("id, action, risk, summary, expires_at, created_at").eq("status", "pending").gt("expires_at", new Date().toISOString());
  q = owner.humanId ? q.eq("human_id", owner.humanId) : q.eq("company_id", owner.companyId!);
  const { data } = await q.order("created_at", { ascending: true }).limit(50);
  return data ?? [];
}

export async function decideApproval(owner: Owner, approvalId: string, approve: boolean) {
  const { data, error } = await createAdminClient().rpc("engine_decide_approval", {
    p_approval: approvalId, p_human: owner.humanId ?? null, p_company: owner.companyId ?? null, p_approve: approve,
  });
  if (error) fail(error);
  const result = data as { status: string; action: string; thread_id: string | null; stage?: string };
  // An approved offer creates the developer's approval; notify them.
  if (result.action === "send_offer" && result.status === "approved" && result.thread_id) {
    await enqueueJob("notify.offer", { threadId: result.thread_id }, { dedupeKey: `offer:${result.thread_id}` });
  }
  return result;
}

export async function myThreads(humanId: string) {
  const admin = createAdminClient();
  const { data: threads } = await admin.from("threads").select("id, role_id, company_id, stage, created_at").eq("human_id", humanId).order("updated_at", { ascending: false }).limit(30);
  if (!threads?.length) return [];
  const [{ data: roles }, { data: companies }] = await Promise.all([
    admin.from("roles").select("id, title").in("id", threads.map((t) => t.role_id)),
    admin.from("companies").select("id, name").in("id", threads.map((t) => t.company_id)),
  ]);
  const roleOf = new Map((roles ?? []).map((r) => [r.id, r.title]));
  const coOf = new Map((companies ?? []).map((c) => [c.id, c.name]));
  return threads.map((t) => ({ id: t.id, role: roleOf.get(t.role_id) ?? "", company: coOf.get(t.company_id) ?? "", stage: t.stage }));
}

// ---------------------------------------------------------------- scheduled housekeeping
export async function expireApprovals() {
  const { data } = await createAdminClient().rpc("engine_expire_approvals");
  return data ?? 0;
}
export async function expireHunts() {
  const { data } = await createAdminClient().rpc("engine_expire_hunts");
  return data ?? 0;
}

// Connector tokens: scoped, expiring, revocable. Only the SHA-256 hash is stored; the token is shown once.
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Owner } from "@/lib/engine/service";

export const DEV_SCOPES = ["profile:read", "evidence:read", "matches:read", "threads:read", "approvals:read", "approvals:decide"] as const;
export const COMPANY_SCOPES = ["company:find", "company:shortlist", "company:request_interview", "company:propose_offer", "approvals:read", "approvals:decide"] as const;
// Deciding approvals is the owner's job. It is OFF unless the owner grants it, so a prompt-injected AI client cannot self-approve.
export const DEFAULT_DEV_SCOPES = ["profile:read", "evidence:read", "matches:read", "threads:read", "approvals:read"];
export const DEFAULT_COMPANY_SCOPES = ["company:find", "company:shortlist", "company:request_interview", "company:propose_offer", "approvals:read"];

const MAX_ACTIVE_TOKENS = 10;
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export type AuthContext = { tokenId: string; owner: Owner; scopes: string[] };

export async function mintToken(owner: Owner, name: string, scopes: string[], days = 90) {
  const allowed: readonly string[] = owner.humanId ? DEV_SCOPES : COMPANY_SCOPES;
  const clean = [...new Set(scopes)].filter((s) => allowed.includes(s));
  const label = name.trim().slice(0, 60);
  if (!label) throw new Error("name_required");
  if (!clean.length) throw new Error("scopes_required");

  const admin = createAdminClient();
  let q = admin.from("agent_tokens").select("id", { count: "exact", head: true }).is("revoked_at", null).gt("expires_at", new Date().toISOString());
  q = owner.humanId ? q.eq("human_id", owner.humanId) : q.eq("company_id", owner.companyId!);
  const { count } = await q;
  if ((count ?? 0) >= MAX_ACTIVE_TOKENS) throw new Error("too_many_tokens");

  const token = `agt_${randomBytes(32).toString("base64url")}`;
  const { error } = await admin.from("agent_tokens").insert({
    human_id: owner.humanId ?? null, company_id: owner.companyId ?? null, name: label, token_hash: hashToken(token), scopes: clean,
    expires_at: new Date(Date.now() + Math.min(days, 365) * 86_400_000).toISOString(),
  });
  if (error) throw new Error("internal");
  return token;
}

export async function revokeToken(humanId: string, tokenId: string) {
  await createAdminClient().from("agent_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", tokenId).eq("human_id", humanId).is("revoked_at", null);
}

// Best-effort per-instance limiter (serverless instances do not share memory); the database is the real authority.
const buckets = new Map<string, { n: number; start: number }>();
const RATE_PER_MIN = 120;
export function rateLimited(tokenId: string) {
  const now = Date.now();
  const b = buckets.get(tokenId);
  if (!b || now - b.start > 60_000) { buckets.set(tokenId, { n: 1, start: now }); return false; }
  b.n += 1;
  return b.n > RATE_PER_MIN;
}

export async function authenticate(request: Request): Promise<AuthContext | null> {
  const m = request.headers.get("authorization")?.match(/^Bearer (agt_[A-Za-z0-9_-]{20,80})$/);
  if (!m) return null;
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("agent_tokens").select("id, human_id, company_id, scopes, last_used_at").eq("token_hash", hashToken(m[1])).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!t) return null;
  if (!t.last_used_at || Date.now() - new Date(t.last_used_at).getTime() > 60_000) {
    await admin.from("agent_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", t.id);
  }
  const owner: Owner = t.human_id ? { humanId: t.human_id } : { companyId: t.company_id! };
  return { tokenId: t.id, owner, scopes: t.scopes };
}

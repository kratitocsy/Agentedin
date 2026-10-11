// Company-side operations used by the Slack connector.
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { EngineError } from "@/lib/engine/service";
import type { RoleSubmission } from "@/lib/slack-forms";

export async function companyForTeam(teamId: string) {
  const admin = createAdminClient();
  const { data: inst } = await admin.from("slack_installations").select("company_id").eq("team_id", teamId).maybeSingle();
  if (!inst) return null;
  const { data: company } = await admin.from("companies").select("id, name, domain, status").eq("id", inst.company_id).single();
  return company ?? null;
}

// Remember who in the workspace uses the bot (for the audit trail and later per-person permissions).
export async function touchMember(companyId: string, slackUserId: string) {
  await createAdminClient().from("company_members").upsert({ company_id: companyId, slack_user_id: slackUserId }, { onConflict: "company_id,slack_user_id", ignoreDuplicates: true });
}

export async function createRole(companyId: string, input: RoleSubmission, slackUserId: string) {
  const admin = createAdminClient();
  const { data: company } = await admin.from("companies").select("status").eq("id", companyId).single();
  if (company?.status !== "approved") throw new EngineError("company_not_approved");
  const { data: role, error } = await admin.from("roles").insert({ company_id: companyId, title: input.title, skills: input.skills, locations: input.locations, remote: input.remote }).select("id").single();
  if (error) throw new EngineError("internal");
  // The budget goes into the sealed table only; it is never stored on the role and never audited.
  const { error: e2 } = await admin.from("role_private_limits").insert({ role_id: role.id, budget_max_ctc: input.budgetMaxCtc });
  if (e2) throw new EngineError("internal");
  await audit({ actor: "human", humanId: null, action: "role.created", entity: "role", entityId: role.id, details: { company_id: companyId, slack_user: slackUserId } });
  return role.id;
}

export async function openRoles(companyId: string) {
  const { data } = await createAdminClient().from("roles").select("id, title, skills, status, created_at").eq("company_id", companyId).eq("status", "open").order("created_at", { ascending: true }).limit(20);
  return data ?? [];
}

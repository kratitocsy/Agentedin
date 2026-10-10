import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { slackCall } from "@/lib/slack";
import { companyDomainFromEmail } from "@/lib/slack-forms";

export const dynamic = "force-dynamic";
const page = (title: string, body: string, status = 200) =>
  new NextResponse(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agentedin</title><body style="font-family:system-ui;max-width:34rem;margin:4rem auto;padding:0 1rem"><h1>${title}</h1><p>${body}</p>`, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const cookieState = request.headers.get("cookie")?.match(/slack_oauth_state=([0-9a-f]{32})/)?.[1];
  const code = q.get("code");
  if (!code || !cookieState || q.get("state") !== cookieState) return page("Link expired", "Please start again from the Agentedin install link.", 400);

  const clientId = process.env.SLACK_CLIENT_ID, secret = process.env.SLACK_CLIENT_SECRET, site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!clientId || !secret || !site) return page("Not configured", "Slack is not configured on this deployment.", 503);

  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, code, redirect_uri: `${site}/api/slack/oauth` }),
    signal: AbortSignal.timeout(10_000),
  }).then((r) => r.json()).catch(() => null) as { ok?: boolean; access_token?: string; bot_user_id?: string; team?: { id: string; name: string }; authed_user?: { id: string } } | null;
  if (!tokenRes?.ok || !tokenRes.access_token || !tokenRes.team || !tokenRes.authed_user) return page("Install failed", "Slack did not complete the install. Please try again.", 502);

  // The company domain comes from the installer's Slack-verified work email.
  const info = await slackCall(tokenRes.access_token, "users.info", { user: tokenRes.authed_user.id });
  const domain = companyDomainFromEmail((info.user as { profile?: { email?: string } } | undefined)?.profile?.email);
  if (!domain) return page("Work email needed", "Install from a Slack account that uses your company email address (not Gmail, Outlook or similar), so we can tell which company you are.", 400);

  const admin = createAdminClient();
  const { data: byTeam } = await admin.from("slack_installations").select("company_id").eq("team_id", tokenRes.team.id).maybeSingle();
  let companyId = byTeam?.company_id;
  if (!companyId) {
    const { data: existing } = await admin.from("companies").select("id").eq("domain", domain).maybeSingle();
    if (existing) {
      const { data: taken } = await admin.from("slack_installations").select("team_id").eq("company_id", existing.id).maybeSingle();
      if (taken) return page("Already connected", "That company is already connected to a Slack workspace.", 409);
      companyId = existing.id;
      await admin.from("companies").update({ slack_team_id: tokenRes.team.id }).eq("id", existing.id);
    } else {
      // New companies start as 'pending'. For the pilot, each one is approved by hand.
      const { data: created, error } = await admin.from("companies").insert({ name: tokenRes.team.name.slice(0, 80), domain, slack_team_id: tokenRes.team.id }).select("id").single();
      if (error) return page("Install failed", "Could not register your company. Please contact us.", 500);
      companyId = created.id;
    }
  }
  const { error: ie } = await admin.from("slack_installations").upsert(
    { team_id: tokenRes.team.id, company_id: companyId, bot_token_enc: encrypt(tokenRes.access_token, "slack-bot-token"), bot_user_id: tokenRes.bot_user_id ?? null, installer_user_id: tokenRes.authed_user.id },
    { onConflict: "team_id" },
  );
  if (ie) return page("Install failed", "Could not save the installation.", 500);
  await admin.from("company_members").upsert({ company_id: companyId, slack_user_id: tokenRes.authed_user.id }, { onConflict: "company_id,slack_user_id", ignoreDuplicates: true });
  await audit({ actor: "human", humanId: null, action: "slack.installed", entity: "company", entityId: companyId, details: { team: tokenRes.team.id, domain } });
  await slackCall(tokenRes.access_token, "chat.postMessage", { channel: tokenRes.authed_user.id, text: "Thanks for installing Agentedin. Your company is pending approval; we approve each company by hand during the pilot. You will be able to use /hire as soon as it is approved." });
  const res = page("Agentedin is installed", "We will review your company shortly. You can close this tab; we will message you in Slack.");
  res.cookies.set("slack_oauth_state", "", { maxAge: 0, path: "/api/slack" });
  return res;
}

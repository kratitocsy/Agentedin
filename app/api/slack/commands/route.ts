import { after, NextResponse } from "next/server";
import { companyForTeam, openRoles, touchMember } from "@/lib/company";
import { companyFind, companyShortlist, EngineError } from "@/lib/engine/service";
import { botFor, candidateBlocks, pipelineBlocks, slackCall, verifySlackSignature } from "@/lib/slack";
import { parseHireCommand, roleModal } from "@/lib/slack-forms";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const say = (text: string) => NextResponse.json({ response_type: "ephemeral", text });
const HELP = "*Agentedin /hire*\n• `/hire post` — post a role\n• `/hire roles` — your open roles\n• `/hire find [role number]` — anonymous candidate cards for a role\n• `/hire shortlist` — your pipeline\nCandidates are shown as agents; a name and contact appear only after the candidate approves an interview.";

async function reply(responseUrl: string, body: Record<string, unknown>) {
  await fetch(responseUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response_type: "ephemeral", replace_original: false, ...body }), signal: AbortSignal.timeout(8_000) }).catch(() => undefined);
}

export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !verifySlackSignature(raw, request.headers.get("x-slack-request-timestamp"), request.headers.get("x-slack-signature"), secret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  const p = new URLSearchParams(raw);
  const teamId = p.get("team_id") ?? "", userId = p.get("user_id") ?? "", responseUrl = p.get("response_url") ?? "";
  // Only ever call back to Slack itself.
  if (!/^https:\/\/hooks\.slack\.com\//.test(responseUrl)) return new NextResponse("Bad request", { status: 400 });

  const company = await companyForTeam(teamId);
  if (!company) return say("Agentedin is not installed for this workspace yet.");
  if (company.status !== "approved") return say("Your company is pending approval. We approve each company by hand during the pilot, and we will message you.");
  await touchMember(company.id, userId);

  const cmd = parseHireCommand(p.get("text") ?? "");
  switch (cmd.kind) {
    case "help":
      return say(HELP);
    case "post": {
      const bot = await botFor(company.id);
      if (!bot) return say("The Agentedin bot token is missing. Please reinstall the app.");
      const r = await slackCall(bot.token, "views.open", { trigger_id: p.get("trigger_id"), view: roleModal() });
      return r.ok ? new NextResponse(null, { status: 200 }) : say("Could not open the form. Please try again.");
    }
    case "roles": {
      const roles = await openRoles(company.id);
      return say(roles.length ? roles.map((r, i) => `${i + 1}. *${r.title.replace(/[&<>]/g, "")}*${r.skills.length ? ` — ${r.skills.join(", ").replace(/[&<>]/g, "")}` : ""}`).join("\n") : "No open roles yet. Use `/hire post`.");
    }
    case "find":
    case "shortlist": {
      const roles = await openRoles(company.id);
      after(async () => {
        try {
          if (cmd.kind === "find") {
            const role = cmd.index ? roles[cmd.index - 1] : roles.length === 1 ? roles[0] : undefined;
            if (!role) return reply(responseUrl, { text: roles.length ? "Which role? Use `/hire find 1` (see `/hire roles`)." : "Post a role first with `/hire post`." });
            const cards = await companyFind(company.id, role.id, 5);
            if (!cards.length) return reply(responseUrl, { text: `No candidates match *${role.title.replace(/[&<>]/g, "")}* right now. We will notify you as developers start hunting.` });
            return reply(responseUrl, { text: `${cards.length} candidate${cards.length > 1 ? "s" : ""} for ${role.title}`, blocks: cards.flatMap((c) => [...candidateBlocks(c, role.title), { type: "divider" }]) });
          }
          const list = await companyShortlist(company.id);
          if (!list.length) return reply(responseUrl, { text: "Your pipeline is empty. Try `/hire find`." });
          const titles = new Map(roles.map((r) => [r.id, r.title]));
          return reply(responseUrl, { text: "Your pipeline", blocks: list.slice(0, 8).flatMap((e) => [...pipelineBlocks(e, titles.get(e.roleId) ?? "Role"), { type: "divider" }]) });
        } catch (e) {
          return reply(responseUrl, { text: e instanceof EngineError && e.code === "company_not_approved" ? "Your company is not approved yet." : "Something went wrong. Please try again." });
        }
      });
      return say(cmd.kind === "find" ? "Searching…" : "Loading your pipeline…");
    }
  }
}

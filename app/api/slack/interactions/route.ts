import { after, NextResponse } from "next/server";
import { companyForTeam, createRole, touchMember } from "@/lib/company";
import { decideApproval, enqueueJob, EngineError, proposeOffer, requestInterview } from "@/lib/engine/service";
import { botFor, slackCall, verifySlackSignature } from "@/lib/slack";
import { offerModal, parseOfferSubmission, parseRoleSubmission, type SlackValues } from "@/lib/slack-forms";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MSG: Record<string, string> = {
  candidate_not_available: "That candidate is no longer available.", role_not_available: "That role is not open.", company_not_approved: "Your company is not approved yet.",
  already_decided: "That was already decided or has expired.", invalid_stage: "That step is no longer available.", not_owner: "You cannot decide that.",
  offer_exists: "An offer already exists for this candidate.", invalid_package: "The offer needs a title and a CTC.",
};
const friendly = (e: unknown) => (e instanceof EngineError ? MSG[e.code] ?? "Something went wrong." : "Something went wrong.");

async function respond(url: string | undefined, body: Record<string, unknown>) {
  if (!url || !/^https:\/\/hooks\.slack\.com\//.test(url)) return;
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8_000) }).catch(() => undefined);
}
async function dm(companyId: string, userId: string, text: string) {
  const bot = await botFor(companyId);
  if (bot) await slackCall(bot.token, "chat.postMessage", { channel: userId, text });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !verifySlackSignature(raw, request.headers.get("x-slack-request-timestamp"), request.headers.get("x-slack-signature"), secret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  let payload: { type?: string; team?: { id?: string }; user?: { id?: string }; trigger_id?: string; response_url?: string; actions?: { action_id?: string; value?: string }[]; view?: { callback_id?: string; private_metadata?: string; state?: { values?: SlackValues } } };
  try { payload = JSON.parse(new URLSearchParams(raw).get("payload") ?? ""); } catch { return new NextResponse("Bad request", { status: 400 }); }

  const company = await companyForTeam(payload.team?.id ?? "");
  const userId = payload.user?.id ?? "";
  if (!company || company.status !== "approved") return NextResponse.json({ text: "Your company is not approved yet." });
  await touchMember(company.id, userId);

  // ---- modal submissions
  if (payload.type === "view_submission" && payload.view) {
    const values = payload.view.state?.values ?? {};
    if (payload.view.callback_id === "post_role") {
      const r = parseRoleSubmission(values);
      if (!r.ok) return NextResponse.json({ response_action: "errors", errors: r.errors });
      try {
        await createRole(company.id, r.role, userId);
      } catch (e) {
        return NextResponse.json({ response_action: "errors", errors: { title: friendly(e) } });
      }
      after(() => dm(company.id, userId, `✅ Role posted: *${r.role.title.replace(/[&<>]/g, "")}*. Use \`/hire find\` to see candidates.`));
      return NextResponse.json({ response_action: "clear" });
    }
    if (payload.view.callback_id === "propose_offer") {
      const r = parseOfferSubmission(values);
      if (!r.ok) return NextResponse.json({ response_action: "errors", errors: r.errors });
      try {
        const approvalId = await proposeOffer(company.id, payload.view.private_metadata ?? "", r.offer);
        await enqueueJob("notify.approval", { approvalId }, { dedupeKey: `approval:${approvalId}` });
      } catch (e) {
        return NextResponse.json({ response_action: "errors", errors: { title: friendly(e) } });
      }
      after(() => dm(company.id, userId, "📝 Offer drafted. Confirm it in the message I am sending you before it reaches the candidate."));
      return NextResponse.json({ response_action: "clear" });
    }
    return new NextResponse(null, { status: 200 });
  }

  // ---- button clicks
  if (payload.type === "block_actions") {
    const action = payload.actions?.[0];
    const id = action?.value ?? "";
    if (!action || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 200 });
    after(async () => {
      try {
        if (action.action_id === "request_interview") {
          await requestInterview(company.id, id);
          await respond(payload.response_url, { response_type: "ephemeral", replace_original: false, text: "✅ Interview requested. The candidate decides; their name and contact stay hidden until they accept." });
        } else if (action.action_id === "approve" || action.action_id === "decline") {
          const r = await decideApproval({ companyId: company.id }, id, action.action_id === "approve");
          const sent = r.action === "send_offer" && r.status === "approved";
          await respond(payload.response_url, { replace_original: true, text: sent ? "✅ Approved. The offer was sent to the candidate." : r.status === "expired" ? "That approval had expired." : `Marked as ${r.status}.` });
        } else if (action.action_id === "propose_offer") {
          const bot = await botFor(company.id);
          if (bot) await slackCall(bot.token, "views.open", { trigger_id: payload.trigger_id, view: offerModal(id) });
        }
      } catch (e) {
        await respond(payload.response_url, { response_type: "ephemeral", replace_original: false, text: friendly(e) });
      }
    });
    return new NextResponse(null, { status: 200 });
  }
  return new NextResponse(null, { status: 200 });
}

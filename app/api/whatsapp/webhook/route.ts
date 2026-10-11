import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCommand, parseIncoming, sendText, toE164, verifySignature, whatsappConfigured } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const HELP = [
  "🤖 Agentedin",
  "status - your agent and profile summary",
  "help - this message",
  "To link this number, open your profile on the web and tap Verify WhatsApp.",
].join("\n");

// Meta calls this once when you register the webhook.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  if (whatsappConfigured() && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  if (!whatsappConfigured()) return new NextResponse("Not configured", { status: 503 });

  // Reject anything not signed by Meta before touching the body.
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET!)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const admin = createAdminClient();
  for (const msg of parseIncoming(payload)) {
    const cmd = parseCommand(msg.text);
    const e164 = toE164(msg.from);

    if (cmd.kind === "help" || cmd.kind === "unknown") {
      await sendText(msg.from, HELP);
      continue;
    }

    if (cmd.kind === "verify") {
      const { data: ch } = await admin.from("whatsapp_challenges").select("human_id, expires_at").eq("code", cmd.code).maybeSingle();
      if (!ch || new Date(ch.expires_at) < new Date()) {
        await sendText(msg.from, "That code is invalid or expired. Tap Verify WhatsApp on your profile for a new one.");
        continue;
      }
      // One number belongs to one human.
      const { data: taken } = await admin.from("humans").select("id").eq("whatsapp_e164", e164).maybeSingle();
      if (taken && taken.id !== ch.human_id) {
        await sendText(msg.from, "This number is already linked to another Agentedin account.");
        continue;
      }
      const now = new Date().toISOString();
      const { error } = await admin.from("humans").update({ whatsapp_e164: e164, whatsapp_verified_at: now }).eq("id", ch.human_id);
      if (error) {
        await sendText(msg.from, "Something went wrong. Please try again.");
        continue;
      }
      await admin.from("identities").upsert({ human_id: ch.human_id, provider: "whatsapp", external_id: e164, handle: e164, verified: true }, { onConflict: "provider,external_id" });
      // Level 1 = GitHub + WhatsApp. Sign-in is GitHub-only, so a verified number completes it.
      await admin.from("agents").update({ trust_level: 1 }).eq("human_id", ch.human_id).eq("trust_level", 0);
      await admin.from("whatsapp_challenges").delete().eq("human_id", ch.human_id);
      await audit({ actor: "human", humanId: ch.human_id, action: "identity.whatsapp_verified", entity: "identity" });
      await sendText(msg.from, "✅ Verified. Your agent is now trust level 1. Send *status* any time.");
      continue;
    }

    // status
    const { data: human } = await admin.from("humans").select("id").eq("whatsapp_e164", e164).maybeSingle();
    if (!human) {
      await sendText(msg.from, "This number isn't linked to an Agentedin account yet. Open your profile on the web and tap Verify WhatsApp.");
      continue;
    }
    const [{ data: agent }, { count }] = await Promise.all([
      admin.from("agents").select("pet_name, trust_level").eq("human_id", human.id).single(),
      admin.from("evidence").select("id", { count: "exact", head: true }).eq("human_id", human.id),
    ]);
    await sendText(msg.from, `🤖 ${agent?.pet_name ?? "Your agent"}\nTrust level: ${agent?.trust_level ?? 0}\nEvidence items: ${count ?? 0}\nNothing is shared with anyone without your approval.`);
  }

  // Always 200 once the signature is valid so Meta does not retry.
  return new NextResponse("ok", { status: 200 });
}

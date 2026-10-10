import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { businessNumber, whatsappConfigured } from "@/lib/whatsapp";
import { startWhatsappVerification } from "./actions";

export const metadata = { title: "Verify WhatsApp" };

export default async function WhatsappPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: human } = await supabase.from("humans").select("whatsapp_e164, whatsapp_verified_at").eq("id", user!.id).single();

  const verified = Boolean(human?.whatsapp_verified_at);
  const configured = whatsappConfigured() && businessNumber() !== "";
  const { data: ch } = verified ? { data: null } : await createAdminClient().from("whatsapp_challenges").select("code, expires_at").eq("human_id", user!.id).maybeSingle();
  const active = ch && new Date(ch.expires_at) > new Date() ? ch : null;
  const masked = human?.whatsapp_e164 ? `${human.whatsapp_e164.slice(0, 3)}••••••${human.whatsapp_e164.slice(-2)}` : "";

  return (
    <>
      <h1 className="text-2xl font-semibold">Verify WhatsApp</h1>
      <p className="text-muted-foreground">GitHub plus a verified WhatsApp number makes your agent trust level 1.</p>
      {error && <p className="my-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {verified ? (
        <Card className="my-4 space-y-2">
          <Badge verified>Verified</Badge>
          <p>Linked number: <strong>{masked}</strong></p>
          <p className="text-sm text-muted-foreground">Message <em>status</em> or <em>help</em> to our WhatsApp number any time.</p>
        </Card>
      ) : !configured ? (
        <Card className="my-4"><p className="text-muted-foreground">WhatsApp verification is not switched on for this deployment yet.</p></Card>
      ) : !active ? (
        <Card className="my-4 space-y-3">
          <p>You&apos;ll send us a short message from the WhatsApp number you want to link. That proves you control it. Nothing is stored except the number.</p>
          <form action={startWhatsappVerification}><Button>Get my code</Button></form>
        </Card>
      ) : (
        <Card className="my-4 space-y-3">
          <p>1. Tap the button and press <strong>Send</strong> in WhatsApp. Don&apos;t edit the message.</p>
          <Button asChild>
            <a href={`https://wa.me/${businessNumber()}?text=${encodeURIComponent(`verify ${active.code}`)}`} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>
          </Button>
          <p className="text-sm text-muted-foreground">Or send <code className="rounded bg-muted px-1">verify {active.code}</code> to +{businessNumber()}. The code works for 15 minutes.</p>
          <p>2. You&apos;ll get a confirmation reply. Then reload this page.</p>
        </Card>
      )}
      <p><Link className="text-primary underline" href="/profile">← Back to profile</Link></p>
    </>
  );
}

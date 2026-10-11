import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { begin, stop } from "./actions";

export const metadata = { title: "Hunt" };
const input = "h-9 w-full rounded-md border bg-background px-3 text-sm";

export default async function Hunt({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: hunt }, { data: agent }] = await Promise.all([
    supabase.from("hunts").select("mode, role_types, places, daily_limit, expires_at").eq("status", "active").gt("expires_at", new Date().toISOString()).maybeSingle(),
    supabase.from("agents").select("trust_level").eq("human_id", user!.id).single(),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Hunt</h1>
      <p className="text-muted-foreground">Let your agent look for roles within limits you set. Companies see your agent and your work, never your name, until you accept an interview.</p>
      {error && <p className="my-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {hunt ? (
        <Card className="my-4 space-y-2">
          <Badge verified>{hunt.mode === "hunting" ? "Hunting" : "Open to inbound"}</Badge>
          <p>Role types: {hunt.role_types.join(", ") || "any"} · Places: {hunt.places.join(", ") || "any"} · Up to {hunt.daily_limit} new shares per day</p>
          <p className="text-sm text-muted-foreground">Ends {new Date(hunt.expires_at).toLocaleDateString()}. You can stop any time.</p>
          <form action={stop}><Button variant="outline" size="sm">Stop hunting</Button></form>
        </Card>
      ) : (
        <>
          {(agent?.trust_level ?? 0) < 1 && (
            <p className="my-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Hunting needs a verified WhatsApp number (trust level 1). Verify it from your profile first.
            </p>
          )}
          <form action={begin} className="my-4 space-y-4">
            <Card className="space-y-3">
              <h2 className="font-semibold">Mode</h2>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="mode" value="hunting" defaultChecked /> <span><strong>Hunting:</strong> my agent shares my profile card with roles that fit, within the daily limit.</span></label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="mode" value="inbound" /> <span><strong>Open to inbound:</strong> companies can find my anonymous card and ask for an interview. My agent shares nothing on its own.</span></label>
            </Card>
            <Card className="space-y-3">
              <h2 className="font-semibold">What my agent may do (your consent covers only this)</h2>
              <label className="block text-sm">Role types (comma separated)<input name="role_types" placeholder="backend, full-stack" className={input} /></label>
              <label className="block text-sm">Places (comma separated, use &quot;remote&quot; for remote)<input name="places" placeholder="remote, Bangalore" className={input} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">New shares per day<input name="daily_limit" type="number" min={1} max={10} defaultValue={3} className={input} /></label>
                <label className="block text-sm">Hunt length (days)<input name="days" type="number" min={1} max={30} defaultValue={14} className={input} /></label>
              </div>
              <label className="block text-sm">Companies that must never see me (domains, e.g. your current employer)<input name="blocked_domains" placeholder="currentemployer.com" className={input} /></label>
            </Card>
            <Card className="space-y-3">
              <h2 className="font-semibold">Private limits (sealed)</h2>
              <p className="text-sm text-muted-foreground">Used only to check fit. Never shown to companies, never sent to an AI model, never written to logs.</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">Minimum CTC (lakh per year)<input name="min_ctc_lakh" type="number" step="0.5" min={1} className={input} /></label>
                <label className="block text-sm">Notice period (days)<input name="notice_days" type="number" min={0} max={180} className={input} /></label>
              </div>
            </Card>
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="consent" required className="mt-1" /> <span>I consent to my agent sharing my anonymous profile card with companies, only within the limits above, until the hunt ends. I can stop at any time.</span></label>
            <Button>Start hunt</Button>
          </form>
        </>
      )}
    </>
  );
}

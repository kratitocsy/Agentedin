import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function Privacy() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: me }, { data: consents }, { data: identities }, { data: events }] = await Promise.all([
    supabase.from("humans").select("consent_version, consented_at").eq("id", user!.id).single(),
    supabase.from("consents").select("id, kind, scope, granted_at, expires_at, revoked_at").order("granted_at", { ascending: false }),
    supabase.from("identities").select("id, provider, handle, verified"),
    supabase.from("audit_events").select("id, actor, action, entity, created_at").order("created_at", { ascending: false }).limit(50),
  ]);

  async function revoke(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const id = String(formData.get("id"));
    const { error } = await supabase.from("consents").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
    if (!error) {
      // audit writes are service-role only; see lib/audit.ts
      const { audit } = await import("@/lib/audit");
      await audit({ actor: "human", humanId: user!.id, action: "consent.revoked", entity: "consent", entityId: id });
    }
    revalidatePath("/privacy");
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Privacy center</h1>

      <h2 className="mt-6 text-lg font-semibold">Privacy policy</h2>
      <Card className="my-3">
        {me?.consented_at ? (
          <p>You accepted the <Link className="text-primary underline" href="/privacy-policy">Privacy Policy</Link> (version {me.consent_version}) on {new Date(me.consented_at).toLocaleDateString()}.</p>
        ) : (
          <p className="text-muted-foreground">No acceptance on record.</p>
        )}
      </Card>

      <h2 className="mt-6 text-lg font-semibold">Active consents</h2>
      {consents?.length ? consents.map((c) => (
        <Card className="my-3" key={c.id}>
          <strong>{c.kind}</strong> <span className="text-sm text-muted-foreground">granted {new Date(c.granted_at).toLocaleDateString()}</span>
          <pre className="text-sm text-muted-foreground">{JSON.stringify(c.scope)}</pre>
          {c.revoked_at ? <Badge>Revoked</Badge> : (
            <form action={revoke}><input type="hidden" name="id" value={c.id} /><Button variant="outline" size="sm">Revoke</Button></form>
          )}
        </Card>
      )) : <p className="text-muted-foreground">You haven&apos;t shared anything with any company.</p>}

      <h2 className="mt-6 text-lg font-semibold">Linked identities</h2>
      {identities?.map((i) => <Card className="my-3" key={i.id}>{i.provider}: {i.handle} {i.verified && <Badge verified>Verified</Badge>}</Card>)}

      <h2 className="mt-6 text-lg font-semibold">Activity log</h2>
      {events?.map((e) => (
        <div key={e.id} className="text-sm text-muted-foreground">{new Date(e.created_at).toLocaleString()} · {e.actor === "agent" ? "🤖" : e.actor === "human" ? "👤" : "⚙️"} {e.action}</div>
      ))}
    </>
  );
}

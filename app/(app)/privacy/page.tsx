import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export default async function Privacy() {
  const supabase = await createClient();
  const [{ data: consents }, { data: identities }, { data: events }] = await Promise.all([
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
      <h1>Privacy center</h1>

      <h2>Active consents</h2>
      {consents?.length ? consents.map((c) => (
        <div className="card" key={c.id}>
          <strong>{c.kind}</strong> <span className="muted">granted {new Date(c.granted_at).toLocaleDateString()}</span>
          <pre className="muted">{JSON.stringify(c.scope)}</pre>
          {c.revoked_at ? <span className="badge">Revoked</span> : (
            <form action={revoke}><input type="hidden" name="id" value={c.id} /><button>Revoke</button></form>
          )}
        </div>
      )) : <p className="muted">You haven&apos;t shared anything with any company.</p>}

      <h2>Linked identities</h2>
      {identities?.map((i) => <div className="card" key={i.id}>{i.provider}: {i.handle} {i.verified && <span className="badge verified">Verified</span>}</div>)}

      <h2>Activity log</h2>
      {events?.map((e) => (
        <div key={e.id} className="muted">{new Date(e.created_at).toLocaleString()} · {e.actor === "agent" ? "🤖" : e.actor === "human" ? "👤" : "⚙️"} {e.action}</div>
      ))}
    </>
  );
}

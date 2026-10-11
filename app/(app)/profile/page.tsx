import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "@/components/agent-avatar";
import { addSelfReported, deleteEvidence, renameAgent, shuffleAvatar } from "./actions";

export default async function Profile({ searchParams }: { searchParams: Promise<{ preview?: string; error?: string }> }) {
  const { preview, error } = await searchParams;
  const asCompany = preview === "company";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: human }, { data: agent }, { data: evidence }] = await Promise.all([
    supabase.from("humans").select("display_name, github_login, photo_url").eq("id", user!.id).single(),
    supabase.from("agents").select("pet_name, avatar_seed, trust_level").eq("human_id", user!.id).single(),
    supabase.from("evidence").select("id, kind, title, summary, source, status").order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <div className="flex items-center gap-4">
        <AgentAvatar seed={agent?.avatar_seed ?? "0000000000000000"} />
        <div>
          <h1 className="text-2xl font-semibold">🤖 {agent?.pet_name}</h1>
          <span className="text-sm text-muted-foreground">
            {asCompany ? "What a company sees" : `${human?.display_name ?? human?.github_login} · trust level ${agent?.trust_level}`}
          </span>
        </div>
      </div>

      <p className="my-4">
        {asCompany ? (
          <Link className="text-primary underline" href="/profile">← Back to my view</Link>
        ) : (
          <Link className="text-primary underline" href="/profile?preview=company">Preview as company</Link>
        )}
      </p>
      {asCompany && (
        <p className="text-sm text-muted-foreground">Companies see the bot persona and work evidence only. Your name, photo and contact are revealed to a company only after you confirm an interview.</p>
      )}

      {error && <p className="my-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {!asCompany && (
        <Card className="my-4 space-y-3">
          <h2 className="font-semibold">Your agent</h2>
          <form action={renameAgent} className="flex gap-2">
            <input name="pet_name" defaultValue={agent?.pet_name} minLength={2} maxLength={24} required className="h-9 flex-1 rounded-md border bg-background px-3 text-sm" />
            <Button variant="outline">Rename</Button>
          </form>
          <form action={shuffleAvatar}>
            <Button variant="outline" size="sm">Shuffle avatar</Button>
          </form>
        </Card>
      )}

      <h2 className="mt-6 text-lg font-semibold">Evidence</h2>
      {evidence?.length ? (
        evidence.map((e) => (
          <Card className="my-3" key={e.id}>
            <Badge verified={e.status === "verified"}>
              {e.status === "verified" ? "Verified" : "Self-reported"} · {e.source}
            </Badge>
            <h3 className="mt-2 font-medium">{e.title}</h3>
            {e.summary && <p>{e.summary}</p>}
            {!asCompany && (
              <form action={deleteEvidence} className="mt-2">
                <input type="hidden" name="id" value={e.id} />
                <Button variant="outline" size="sm">Remove</Button>
              </form>
            )}
          </Card>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">No evidence yet. Connect GitHub projects or Codeforces below.</p>
      )}

      {!asCompany && (
        <>
          <h2 className="mt-8 text-lg font-semibold">Add evidence</h2>
          <Card className="my-3">
            <h3 className="font-medium">WhatsApp number (unlocks trust level 1)</h3>
            <p className="text-sm text-muted-foreground">Send a one-time code from your WhatsApp. It also lets you message your agent.</p>
            <Button asChild variant="outline" size="sm" className="mt-2"><Link href="/profile/whatsapp">Verify WhatsApp</Link></Button>
          </Card>
          <Card className="my-3">
            <h3 className="font-medium">GitHub projects and skills (verified)</h3>
            <p className="text-sm text-muted-foreground">Choose repos; we count your commits and languages. Read-only, code is never stored.</p>
            <Button asChild variant="outline" size="sm" className="mt-2"><Link href="/profile/github">Connect GitHub projects</Link></Button>
          </Card>
          <Card className="my-3">
            <h3 className="font-medium">Codeforces rating (verified)</h3>
            <p className="text-sm text-muted-foreground">Prove the handle is yours and we add your rating as verified.</p>
            <Button asChild variant="outline" size="sm" className="mt-2"><Link href="/profile/codeforces">Connect Codeforces</Link></Button>
          </Card>
          <Card className="my-3">
            <h3 className="font-medium">LeetCode or résumé (self-reported)</h3>
            <p className="text-sm text-muted-foreground">Shown to companies labeled Self-reported.</p>
            <form action={addSelfReported} className="mt-2 space-y-2">
              <select name="source" className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="leetcode">LeetCode</option>
                <option value="resume">Résumé</option>
              </select>
              <input name="title" required minLength={2} maxLength={120} placeholder="e.g. LeetCode: 450 solved, rating 1900" className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
              <textarea name="summary" maxLength={1000} placeholder="Details (optional)" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
              <Button>Add</Button>
            </form>
          </Card>
        </>
      )}
    </>
  );
}

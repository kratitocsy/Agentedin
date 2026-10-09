import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { avatarColors } from "@/lib/avatar";

export default async function Profile({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const asCompany = preview === "company";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: human }, { data: agent }, { data: evidence }] = await Promise.all([
    supabase.from("humans").select("display_name, github_login, photo_url").eq("id", user!.id).single(),
    supabase.from("agents").select("pet_name, avatar_seed, trust_level").eq("human_id", user!.id).single(),
    supabase.from("evidence").select("id, kind, title, summary, source, status").order("created_at", { ascending: false }),
  ]);
  const [c1, c2] = avatarColors(agent?.avatar_seed ?? "0");

  return (
    <>
      <div className="flex items-center gap-4">
        <svg width="64" height="64" aria-label="agent avatar">
          <defs><linearGradient id="g"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient></defs>
          <circle cx="32" cy="32" r="30" fill="url(#g)" />
        </svg>
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

      <h2 className="mt-6 text-lg font-semibold">Evidence</h2>
      {evidence?.length ? (
        evidence.map((e) => (
          <Card className="my-3" key={e.id}>
            <Badge verified={e.status === "verified"}>
              {e.status === "verified" ? "Verified" : "Self-reported"} · {e.source}
            </Badge>
            <h3 className="mt-2 font-medium">{e.title}</h3>
            {e.summary && <p>{e.summary}</p>}
          </Card>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">No evidence yet. GitHub project analysis and Codeforces rating are coming next in Phase 1.</p>
      )}
    </>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <svg width="64" height="64" aria-label="agent avatar">
          <defs><linearGradient id="g"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient></defs>
          <circle cx="32" cy="32" r="30" fill="url(#g)" />
        </svg>
        <div>
          <h1 style={{ margin: 0 }}>🤖 {agent?.pet_name}</h1>
          <span className="muted">
            {asCompany ? "What a company sees" : `${human?.display_name ?? human?.github_login} · trust level ${agent?.trust_level}`}
          </span>
        </div>
      </div>

      <p>
        {asCompany ? (
          <Link href="/profile">← Back to my view</Link>
        ) : (
          <Link href="/profile?preview=company">Preview as company</Link>
        )}
      </p>
      {asCompany && (
        <p className="muted">Companies see the bot persona and work evidence only. Your name, photo and contact are revealed to a company only after you confirm an interview.</p>
      )}

      <h2>Evidence</h2>
      {evidence?.length ? (
        evidence.map((e) => (
          <div className="card" key={e.id}>
            <span className={`badge ${e.status === "verified" ? "verified" : ""}`}>
              {e.status === "verified" ? "Verified" : "Self-reported"} · {e.source}
            </span>
            <h3>{e.title}</h3>
            {e.summary && <p>{e.summary}</p>}
          </div>
        ))
      ) : (
        <p className="muted">No evidence yet. GitHub project analysis and Codeforces rating are coming next in Phase 1.</p>
      )}
    </>
  );
}

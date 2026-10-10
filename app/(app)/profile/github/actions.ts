"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { analyzeRepo, installationToken, listRepos } from "@/lib/github-app";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_REPOS = 5;
const back = (msg: string): never => redirect(`/profile/github?error=${encodeURIComponent(msg)}`);

export async function analyzeSelected(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const picked = z.array(z.string().min(3).max(140)).min(1, "Pick at least one repo").max(MAX_REPOS, `Pick at most ${MAX_REPOS} repos`).safeParse(formData.getAll("repo").map(String));
  if (!picked.success) return back(picked.error.issues[0].message);

  const [{ data: inst }, { data: human }] = await Promise.all([
    supabase.from("github_installations").select("installation_id").maybeSingle(),
    supabase.from("humans").select("github_login").eq("id", user.id).single(),
  ]);
  if (!inst || !human?.github_login) return back("Install the GitHub App first");

  try {
    const token = await installationToken(inst.installation_id);
    // Never trust the form: only analyze repos the installation can actually see.
    const allowed = new Map((await listRepos(token)).map((r) => [r.full_name, r]));
    const repos = picked.data.map((n) => allowed.get(n)).filter((r) => r !== undefined);
    if (!repos.length) return back("Those repos are not available to the app");

    const results = await Promise.all(repos.map((r) => analyzeRepo(token, r, human.github_login!)));
    const authored = results.filter((a) => a.commits > 0);
    if (!authored.length) return back("No commits by you were found in the selected repos");

    const admin = createAdminClient();
    await admin.from("evidence").delete().eq("human_id", user.id).eq("source", "github");

    const projects = authored.map((a) => {
      const total = Object.values(a.languages).reduce((x, y) => x + y, 0) || 1;
      const langs = Object.entries(a.languages).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([l]) => l);
      return {
        human_id: user.id,
        kind: "project",
        title: a.repo.name,
        summary: [a.repo.description, `${a.commits}${a.commits >= 300 ? "+" : ""} commits by you${a.firstCommit ? `, ${a.firstCommit.slice(0, 7)} to ${a.lastCommit!.slice(0, 7)}` : ""}`, langs.length ? `Stack: ${langs.join(", ")}` : null].filter(Boolean).join(" · "),
        source: "github",
        status: "verified",
        data: { repo: a.repo.full_name, url: a.repo.private ? null : a.repo.html_url, private: a.repo.private, stars: a.repo.stargazers_count, commits: a.commits, languages: Object.fromEntries(Object.entries(a.languages).map(([l, b]) => [l, Math.round((b / total) * 100)])) },
      };
    });

    // Skills = languages weighted by bytes across the analyzed repos where the human has commits.
    const bytes: Record<string, number> = {};
    for (const a of authored) for (const [l, b] of Object.entries(a.languages)) bytes[l] = (bytes[l] ?? 0) + b;
    const sum = Object.values(bytes).reduce((x, y) => x + y, 0) || 1;
    const skills = Object.entries(bytes).filter(([, b]) => b / sum >= 0.03).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([l, b]) => ({
      human_id: user.id, kind: "skill", title: l,
      summary: `${Math.round((b / sum) * 100)}% of code across ${authored.filter((a) => a.languages[l]).length} analyzed repo(s)`,
      source: "github", status: "verified", data: { share: Math.round((b / sum) * 100) },
    }));

    const { error } = await admin.from("evidence").insert([...projects, ...skills]);
    if (error) return back("Could not save your evidence");
    await audit({ actor: "human", humanId: user.id, action: "evidence.github_analyzed", entity: "evidence", details: { repos: authored.map((a) => a.repo.full_name), count: projects.length + skills.length } });
  } catch {
    return back("GitHub did not respond. Try again in a minute.");
  }
  revalidatePath("/profile");
  redirect("/profile");
}

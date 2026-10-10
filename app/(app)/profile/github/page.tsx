import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { audit } from "@/lib/audit";
import { getInstallation, githubAppConfigured, githubAppSlug, installationToken, listRepos, type Repo } from "@/lib/github-app";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { analyzeSelected } from "./actions";

export const metadata = { title: "Connect GitHub projects" };
export const maxDuration = 60;

export default async function ConnectGithub({ searchParams }: { searchParams: Promise<{ installation_id?: string; error?: string }> }) {
  const { installation_id, error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!githubAppConfigured()) {
    return <p className="text-muted-foreground">The GitHub App is not configured on this deployment yet.</p>;
  }

  // GitHub redirects here after install/update with ?installation_id=. That value is user-controlled, so verify
  // the installation belongs to the signed-in human's GitHub account before linking it.
  if (installation_id && /^\d+$/.test(installation_id)) {
    const { data: human } = await supabase.from("humans").select("github_login").eq("id", user!.id).single();
    let message = "";
    try {
      const inst = await getInstallation(Number(installation_id));
      if (inst.account.type !== "User" || inst.account.login.toLowerCase() !== human?.github_login?.toLowerCase()) {
        message = "That installation belongs to a different GitHub account.";
      } else {
        const { error: e } = await createAdminClient()
          .from("github_installations")
          .upsert({ installation_id: inst.id, human_id: user!.id, account_login: inst.account.login }, { onConflict: "installation_id" });
        if (e) message = "Could not save the installation.";
        else await audit({ actor: "human", humanId: user!.id, action: "github.installation_linked", entity: "github_installation", entityId: String(inst.id) });
      }
    } catch {
      message = "Could not verify the installation with GitHub.";
    }
    redirect(message ? `/profile/github?error=${encodeURIComponent(message)}` : "/profile/github");
  }

  const { data: inst } = await supabase.from("github_installations").select("installation_id").maybeSingle();
  let repos: Repo[] = [];
  let loadError = "";
  if (inst) {
    try {
      repos = await listRepos(await installationToken(inst.installation_id));
    } catch {
      loadError = "Could not load your repos from GitHub.";
    }
  }
  const msg = error || loadError;

  return (
    <>
      <h1 className="text-2xl font-semibold">Connect GitHub projects</h1>
      <p className="text-muted-foreground">
        You choose which repos Agentedin can read (read-only). We count the commits you authored and the languages you use, and add them as verified evidence. Code is never stored.
      </p>
      {msg && <p className="my-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{msg}</p>}

      {!inst ? (
        <Card className="my-4 space-y-3">
          <p>Install the Agentedin GitHub App and pick the repos to share.</p>
          <Button asChild><a href={`https://github.com/apps/${githubAppSlug()}/installations/new`}>Install GitHub App</a></Button>
        </Card>
      ) : (
        <>
          <form action={analyzeSelected} className="my-4 space-y-2">
            <p className="text-sm text-muted-foreground">Pick up to 5 repos to analyze.</p>
            {repos.length === 0 && <p className="text-muted-foreground">No repos shared with the app yet.</p>}
            {repos.map((r) => (
              <label key={r.id} className="flex items-start gap-3 rounded-lg border p-3">
                <input type="checkbox" name="repo" value={r.full_name} className="mt-1" />
                <span>
                  <strong>{r.full_name}</strong> {r.private && <span className="text-xs text-muted-foreground">(private)</span>} {r.fork && <span className="text-xs text-muted-foreground">(fork)</span>}
                  {r.description && <span className="block text-sm text-muted-foreground">{r.description}</span>}
                </span>
              </label>
            ))}
            {repos.length > 0 && <Button>Build my evidence</Button>}
          </form>
          <p className="text-sm">
            <a className="text-primary underline" href={`https://github.com/settings/installations/${inst.installation_id}`}>Change which repos the app can see</a>
          </p>
        </>
      )}
      <p className="mt-4"><Link className="text-primary underline" href="/profile">← Back to profile</Link></p>
    </>
  );
}

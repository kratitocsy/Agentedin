import { createSign } from "node:crypto";

const API = "https://api.github.com";
const HEADERS = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "agentedin" };

export const githubAppConfigured = () => Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
export const githubAppSlug = () => process.env.GITHUB_APP_SLUG ?? "agentedin";

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

// Env var UIs mangle multi-line values (newlines become spaces or literal "\n"). Rebuild a valid PEM from whatever arrives.
export function normalizePem(raw: string) {
  const m = raw.replace(/\\n/g, "\n").match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
  if (!m) throw new Error("GITHUB_APP_PRIVATE_KEY is not a PEM key");
  const body = m[2].replace(/\s+/g, "");
  return `-----BEGIN ${m[1]}-----\n${body.match(/.{1,64}/g)!.join("\n")}\n-----END ${m[1]}-----\n`;
}

// Short-lived JWT proving we are the app. Signed with the private key, which never leaves the server.
function appJwt() {
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iat: now - 30, exp: now + 540, iss: process.env.GITHUB_APP_ID }),
  )}`;
  const key = normalizePem(process.env.GITHUB_APP_PRIVATE_KEY!);
  return `${input}.${b64url(createSign("RSA-SHA256").update(input).sign(key))}`;
}

async function gh<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...HEADERS, Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

export type Installation = { id: number; account: { login: string; type: string } };

// Anyone can put any installation_id in a URL, so callers must check account.login against the signed-in human.
export const getInstallation = (id: number) => gh<Installation>(`/app/installations/${id}`, appJwt());

export async function installationToken(id: number) {
  const r = await gh<{ token: string }>(`/app/installations/${id}/access_tokens`, appJwt(), { method: "POST" });
  return r.token;
}

export type Repo = { id: number; full_name: string; name: string; description: string | null; html_url: string; fork: boolean; private: boolean; stargazers_count: number; pushed_at: string | null };

export async function listRepos(token: string): Promise<Repo[]> {
  const r = await gh<{ repositories: Repo[] }>("/installation/repositories?per_page=100", token);
  return r.repositories;
}

export type RepoAnalysis = {
  repo: Repo;
  languages: Record<string, number>;
  commits: number;
  firstCommit: string | null;
  lastCommit: string | null;
};

// Counts up to 300 commits authored by `login` in the repo (verified via the GitHub commits API, not claimed).
export async function analyzeRepo(token: string, repo: Repo, login: string): Promise<RepoAnalysis> {
  const [languages, ...pages] = await Promise.all([
    gh<Record<string, number>>(`/repos/${repo.full_name}/languages`, token),
    ...[1, 2, 3].map((page) =>
      gh<{ commit: { author: { date: string } } }[]>(`/repos/${repo.full_name}/commits?author=${encodeURIComponent(login)}&per_page=100&page=${page}`, token).catch(() => []),
    ),
  ]);
  const dates = pages.flat().map((c) => c.commit.author.date).sort();
  return { repo, languages, commits: dates.length, firstCommit: dates[0] ?? null, lastCommit: dates.at(-1) ?? null };
}

const GH = "https://github.com";
const API = "https://api.github.com";

export function authorizeUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: `${process.env.BACKEND_URL}/api/auth/github/callback`,
    scope: "read:user user:email",
    state,
  });
  return `${GH}/login/oauth/authorize?${q}`;
}

export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(`${GH}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(data.error ?? "GitHub token exchange failed");
  return data.access_token;
}

async function gh<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  followers: number;
  public_repos: number;
}

export const getUser = (token: string) => gh<GithubUser>("/user", token);

export async function getPrimaryEmail(token: string): Promise<string | null> {
  const emails = await gh<{ email: string; primary: boolean; verified: boolean }[]>("/user/emails", token);
  return emails.find((e) => e.primary && e.verified)?.email ?? null;
}

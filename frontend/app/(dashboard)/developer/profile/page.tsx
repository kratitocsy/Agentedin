"use client";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Me {
  github_login: string;
  email: string | null;
  profile_data: { name?: string; avatar_url?: string; followers?: number; public_repos?: number };
  skills: string[];
}

export default function Profile() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Please sign in"))))
      .then(setMe)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p>{error} — <a href="/login">sign in</a></p>;
  if (!me) return <p>Loading…</p>;

  return (
    <main>
      <h1>{me.profile_data.name ?? me.github_login}</h1>
      <p>@{me.github_login} · {me.email ?? "no public email"}</p>
      <p>{me.profile_data.public_repos} repos · {me.profile_data.followers} followers</p>
    </main>
  );
}

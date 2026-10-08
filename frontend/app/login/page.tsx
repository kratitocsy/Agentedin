const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function Login() {
  return (
    <main>
      <h1>Agentedin</h1>
      <p>Autonomous agent-based hiring. Sign in to build your profile from GitHub.</p>
      <a href={`${API}/api/auth/github`}>Sign in with GitHub</a>
    </main>
  );
}

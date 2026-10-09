import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/profile");

  async function signIn() {
    "use server";
    const supabase = await createClient();
    const { data } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`, scopes: "read:user user:email" },
    });
    if (data.url) redirect(data.url);
  }

  return (
    <main>
      <h1>Agentedin</h1>
      <p>Your agent gets you interviews, with proof of your work.</p>
      <p className="muted">
        By signing in you create one agent for yourself. It can only share what you make visible, and you approve every
        share, interview and offer.
      </p>
      <form action={signIn}>
        <button className="primary">Sign in with GitHub</button>
      </form>
    </main>
  );
}

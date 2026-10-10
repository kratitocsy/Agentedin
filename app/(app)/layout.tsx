import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // New accounts finish onboarding (agent name, avatar, consent) before using the app.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: human } = await supabase.from("humans").select("onboarded_at").eq("id", user.id).single();
    if (!human?.onboarded_at) redirect("/onboarding");
  }
  return (
    <>
      <nav className="flex items-center gap-4 border-b p-4">
        <strong>Agentedin</strong>
        <Link href="/profile">Profile</Link>
        <Link href="/privacy">Privacy center</Link>
        <form action="/auth/signout" method="post" className="ml-auto">
          <Button variant="outline" size="sm">Sign out</Button>
        </form>
      </nav>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </>
  );
}

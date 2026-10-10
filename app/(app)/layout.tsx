import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandBar } from "@/components/brand-bar";
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
      <BrandBar>
        <nav className="flex items-center gap-4 text-sm text-white/80">
          <Link className="hover:text-white" href="/profile">Profile</Link>
          <Link className="hover:text-white" href="/privacy">Privacy center</Link>
        </nav>
        <form action="/auth/signout" method="post" className="ml-auto">
          <Button variant="outline" size="sm" className="bg-transparent text-white hover:bg-white/10">Sign out</Button>
        </form>
      </BrandBar>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </>
  );
}

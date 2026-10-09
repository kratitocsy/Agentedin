import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
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

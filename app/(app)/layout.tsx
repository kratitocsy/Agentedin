import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav>
        <strong>Agentedin</strong>
        <Link href="/profile">Profile</Link>
        <Link href="/privacy">Privacy center</Link>
        <form action="/auth/signout" method="post" style={{ marginLeft: "auto" }}>
          <button>Sign out</button>
        </form>
      </nav>
      <main>{children}</main>
    </>
  );
}

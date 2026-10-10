import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isValidHandle, verificationCode } from "@/lib/codeforces";
import { createClient } from "@/lib/supabase/server";
import { startCodeforces, verifyCodeforces } from "./actions";

export const metadata = { title: "Connect Codeforces" };

export default async function ConnectCodeforces({ searchParams }: { searchParams: Promise<{ handle?: string; error?: string }> }) {
  const { handle, error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const valid = handle && isValidHandle(handle);

  return (
    <>
      <h1 className="text-2xl font-semibold">Connect Codeforces</h1>
      <p className="text-muted-foreground">We verify that the handle is yours, then add your rating as verified evidence.</p>
      {error && <p className="my-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {!valid ? (
        <form action={startCodeforces} className="my-4 flex gap-2">
          <input name="handle" required placeholder="Your Codeforces handle" className="h-9 flex-1 rounded-md border bg-background px-3 text-sm" />
          <Button>Continue</Button>
        </form>
      ) : (
        <Card className="my-4 space-y-3">
          <p>
            1. On Codeforces, open <strong>Settings → Social</strong> and put this code in <strong>Organization</strong> (you can remove it afterwards):
          </p>
          <code className="block rounded-md bg-muted p-3 text-sm">{verificationCode(user!.id, handle)}</code>
          <p>2. Save, then verify below.</p>
          <form action={verifyCodeforces}>
            <input type="hidden" name="handle" value={handle} />
            <Button>Verify {handle}</Button>
          </form>
        </Card>
      )}
      <Link className="text-primary underline" href="/profile">← Back to profile</Link>
    </>
  );
}

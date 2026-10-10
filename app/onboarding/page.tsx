import { randomBytes } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AgentAvatar } from "@/components/agent-avatar";
import { BrandBar } from "@/components/brand-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { completeOnboarding } from "./actions";

export const metadata = { title: "Welcome", robots: { index: false, follow: false } };

const SUGGESTIONS = ["Byte", "Neo", "Kiwi", "Orbit", "Chai", "Pixel", "Nova", "Bolt"];

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: human }, { data: agent }] = await Promise.all([
    supabase.from("humans").select("onboarded_at").eq("id", user.id).single(),
    supabase.from("agents").select("avatar_seed").eq("human_id", user.id).single(),
  ]);
  if (human?.onboarded_at) redirect("/profile");

  // Current avatar plus five fresh options. The submitted seed is validated server-side.
  const seeds = [agent?.avatar_seed, ...Array.from({ length: 5 }, () => randomBytes(8).toString("hex"))].filter((s): s is string => Boolean(s));

  return (
    <>
    <BrandBar />
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold">Welcome to Agentedin</h1>
      <p className="mt-2 text-muted-foreground">Set up your agent in one minute. It represents you with proof of your work, and nothing is shared without your say-so.</p>
      {error && <p className="my-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <form action={completeOnboarding} className="mt-6 space-y-6">
        <Card className="space-y-3">
          <h2 className="font-semibold">1. Name your agent</h2>
          <input
            name="pet_name"
            list="names"
            required
            minLength={2}
            maxLength={24}
            placeholder="e.g. Byte"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
          <datalist id="names">{SUGGESTIONS.map((n) => <option key={n} value={n} />)}</datalist>
          <p className="text-sm text-muted-foreground">Companies see your agent, not your name or photo, until you confirm an interview.</p>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">2. Pick its avatar</h2>
          <div className="flex flex-wrap gap-3">
            {seeds.map((seed, i) => (
              <label key={seed} className="cursor-pointer rounded-lg border p-2 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary">
                <input type="radio" name="avatar_seed" value={seed} defaultChecked={i === 0} className="sr-only" />
                <AgentAvatar seed={seed} size={56} label={`avatar option ${i + 1}`} />
              </label>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">You can change it any time from your profile.</p>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">3. How we use your data</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>We read your GitHub profile and email, and only the repositories <strong>you</strong> choose (read-only). We keep counts, languages and dates. <strong>We never store your code.</strong></li>
            <li>We use this to build your evidence profile, labeled <em>verified</em> or <em>self-reported</em>.</li>
            <li>Companies never see your name, photo or contact until <strong>you</strong> confirm an interview with them.</li>
            <li>We don&apos;t sell your data. Every action is logged, and you can see and revoke consents in your Privacy center.</li>
          </ul>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="consent" required className="mt-1" />
            <span>
              I have read the <Link className="text-primary underline" href="/privacy-policy" target="_blank">Privacy Policy</Link> and I consent to Agentedin processing my data as described there. I can withdraw this consent at any time.
            </span>
          </label>
        </Card>

        <Button>Create my agent</Button>
      </form>
    </main>
    </>
  );
}

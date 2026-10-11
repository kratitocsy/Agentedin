import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listApprovals, myThreads } from "@/lib/engine/service";
import { createClient } from "@/lib/supabase/server";
import { decide } from "./actions";

export const metadata = { title: "Approvals" };

const STAGES: Record<string, string> = {
  shortlisted: "Your agent shared your profile",
  interview_requested: "Interview requested",
  interview_confirmed: "Interview confirmed",
  offer_proposed: "Offer proposed",
  offer_accepted: "Offer accepted",
};

export default async function Approvals({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [approvals, threads] = await Promise.all([listApprovals({ humanId: user!.id }), myThreads(user!.id)]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Approvals</h1>
      <p className="text-muted-foreground">Your agent proposes. You decide. Nothing is revealed or accepted without you.</p>
      {error && <p className="my-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <h2 className="mt-6 text-lg font-semibold">Waiting for you</h2>
      {approvals.length === 0 && <p className="text-muted-foreground">Nothing is waiting.</p>}
      {approvals.map((a) => (
        <Card key={a.id} className="my-3 space-y-2">
          <Badge>{a.action.replace("_", " ")}</Badge>
          <p>{a.summary}</p>
          <p className="text-sm text-muted-foreground">Expires {new Date(a.expires_at).toLocaleString()}</p>
          <form action={decide} className="flex gap-2">
            <input type="hidden" name="id" value={a.id} />
            <Button name="decision" value="approve">Approve</Button>
            <Button name="decision" value="decline" variant="outline">Decline</Button>
          </form>
        </Card>
      ))}

      <h2 className="mt-8 text-lg font-semibold">Your hunt board</h2>
      {threads.length === 0 && <p className="text-muted-foreground">No conversations yet. Start a hunt to let your agent look for roles.</p>}
      {threads.map((t) => (
        <Card key={t.id} className="my-3">
          <strong>{t.role}</strong> · {t.company}
          <p className="text-sm text-muted-foreground">{STAGES[t.stage] ?? t.stage}</p>
        </Card>
      ))}
    </>
  );
}

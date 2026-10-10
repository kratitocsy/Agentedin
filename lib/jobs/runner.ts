import { createAdminClient } from "@/lib/supabase/admin";
import { HANDLERS } from "./handlers";
import { backoffMinutes, MAX_ATTEMPTS, recurringSpecs } from "./schedule";

// Called every minute by pg_cron. Enqueues due recurring jobs, then works through the queue within a time budget.
export async function ensureRecurring(now = Date.now()) {
  const admin = createAdminClient();
  for (const s of recurringSpecs(now)) {
    const { error } = await admin.from("jobs").insert({ kind: s.kind, dedupe_key: s.key, run_at: s.runAt.toISOString() });
    if (error && error.code !== "23505") throw new Error(`enqueue failed: ${error.message}`); // 23505 = already enqueued this period
  }
}

export async function dispatch(opts: { budgetMs?: number; batch?: number } = {}) {
  const budget = opts.budgetMs ?? 40_000;
  const started = Date.now();
  const admin = createAdminClient();
  const out = { done: 0, skipped: 0, retried: 0, failed: 0 };
  await ensureRecurring();

  while (Date.now() - started < budget) {
    const { data: jobs } = await admin.rpc("claim_jobs", { batch: opts.batch ?? 5, lease_seconds: 120 });
    if (!jobs?.length) break;
    for (const job of jobs) {
      const handler = HANDLERS[job.kind];
      try {
        if (!handler) throw new Error(`no handler for ${job.kind}`);
        const r = await handler((job.payload ?? {}) as Record<string, unknown>);
        await admin.from("jobs").update({ status: "done", finished_at: new Date().toISOString(), last_error: null, locked_until: null }).eq("id", job.id);
        out[r === "skipped" ? "skipped" : "done"] += 1;
      } catch (e) {
        const msg = (e instanceof Error ? e.message : "error").slice(0, 500);
        if (job.attempts >= MAX_ATTEMPTS) {
          await admin.from("jobs").update({ status: "failed", finished_at: new Date().toISOString(), last_error: msg, locked_until: null }).eq("id", job.id);
          out.failed += 1;
        } else {
          await admin.from("jobs").update({ status: "queued", run_at: new Date(Date.now() + backoffMinutes(job.attempts) * 60_000).toISOString(), last_error: msg, locked_until: null }).eq("id", job.id);
          out.retried += 1;
        }
      }
    }
  }
  return out;
}

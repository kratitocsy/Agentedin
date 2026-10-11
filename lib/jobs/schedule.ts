// Pure scheduling rules (no I/O) so they can be tested exactly.
export type JobSpec = { kind: string; key: string; runAt: Date };

const MIN = 60_000;
const bucket = (now: number, ms: number) => Math.floor(now / ms);

// One job per time bucket: the dispatcher can run every minute and each recurring job still fires once per period.
export function recurringSpecs(now: number): JobSpec[] {
  const specs: JobSpec[] = [
    { kind: "approvals.expire", key: `cron:approvals.expire:${bucket(now, 5 * MIN)}`, runAt: new Date(now) },
    { kind: "matching.run", key: `cron:matching.run:${bucket(now, 15 * MIN)}`, runAt: new Date(now) },
    { kind: "hunts.expire", key: `cron:hunts.expire:${bucket(now, 60 * MIN)}`, runAt: new Date(now) },
  ];
  // Weekly digest: Monday 09:00 IST (03:30 UTC). If the window was missed (more than 12h ago) it waits for next week.
  const d = new Date(now);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday, 3, 30);
  if (now >= monday && now < monday + 12 * 60 * MIN) {
    specs.push({ kind: "digest.weekly", key: `cron:digest.weekly:${new Date(monday).toISOString().slice(0, 10)}`, runAt: new Date(monday) });
  }
  return specs;
}

// Failed jobs retry with exponential backoff: 2, 4, 8, 16 minutes, then they stay failed.
export const MAX_ATTEMPTS = 5;
export const backoffMinutes = (attempts: number) => 2 ** Math.min(attempts, 4);

// Wynkogent rule 6: at least 24h between nudges, and never while paused (unsubscribed or refused).
export function nudgeAllowed(row: { last_sent_at: string | null; paused_until: string | null } | null, now: number) {
  if (!row) return true;
  if (row.paused_until && new Date(row.paused_until).getTime() > now) return false;
  if (row.last_sent_at && now - new Date(row.last_sent_at).getTime() < 24 * 60 * MIN) return false;
  return true;
}

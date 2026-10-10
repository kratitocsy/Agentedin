# Backend pipeline

One engine, many thin connectors. Every connector calls the same service layer (`lib/engine/service.ts`); every state change
that matters is one atomic Postgres function, tested in SQL.

```
 Claude / Cursor / OpenClaw ──MCP or REST──┐
 Slack (/hire, buttons) ────signed webhook──┤        ┌── Postgres (Supabase)
 Web (approvals, hunt, connect) ──session───┼─► engine service ──► engine_* functions (atomic)
 WhatsApp (verify, status) ─signed webhook──┤        │   sealed limits, approvals, reveal, offers
 pg_cron → /api/cron/dispatch ──vault secret┘        └── jobs queue (claim/retry/dedupe), audit log
```

## The loop
1. **Developer** verifies WhatsApp (trust 1), sets sealed limits and a **hunt** (consent scoped to role types, places, daily limit, blocked companies, duration) → trust 2.
2. **Company** installs the Slack app; the company domain comes from the installer's Slack-verified work email. You approve each company by hand (`update companies set status='approved' ...`).
3. `/hire post` creates a role; the budget goes into a sealed table.
4. **Matching** (every 15 min, or on `/hire find`): scores verified evidence against the role, inside the hunt's consent scope. Hunting mode auto-shares an anonymous card when the sealed fit check says `fits`, within the daily limit.
5. Company clicks **Request interview** → a developer approval is created (48h). Nothing is revealed yet.
6. Developer approves (web, MCP only if granted) → name, photo and email are written into that one thread for that one company.
7. Company drafts an offer → its own human confirms (24h) → developer confirms (48h) → placement recorded (flat fee, waived in the pilot).
8. Jobs expire stale approvals and ended hunts, send the weekly digest (nudge limits, unsubscribe), and notify by email/Slack.

## Where each rule is enforced
| Rule | Enforced in |
|---|---|
| Salary limits never leave the database; callers get `fits / no_fit / unknown` | `engine_fit_check` + no tool/route reads the sealed tables |
| Only the approval's owner can decide; no double-decide; no decide after expiry | `engine_decide_approval` |
| Identity revealed only after the developer approves, only in that thread | `engine_decide_approval` (accept_interview) |
| Blocked companies and no-fit candidates are indistinguishable to the caller | `engine_request_interview` (`candidate_not_available`) |
| AI clients cannot approve unless the owner grants the scope | `lib/agent/tokens.ts`, `lib/agent/tools.ts` |
| Third-party text is data | tool descriptions + result notes, structured messages only |
| Every webhook is authenticated | Meta / Slack signatures (+ replay window), cron secret verified by the database |
| Nudges: >=24h apart, pausable, unsubscribe | `nudge_counters`, `lib/jobs/schedule.ts` |

## Configuration (Vercel environment variables)
| Variable | Needed for |
|---|---|
| `SUPABASE_*`, `NEXT_PUBLIC_SITE_URL` | already set |
| `GITHUB_APP_*` | already set |
| `WHATSAPP_*` (5) | WhatsApp verification and bot |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | Slack company bot |
| `RESEND_API_KEY`, `EMAIL_FROM` (optional) | email notifications and the digest |
The cron secret is **not** an environment variable: it lives in Supabase Vault and the app checks it by calling the database.

## Known limits (pilot)
- Any member of an approved company's Slack workspace can use `/hire` (per-person roles come later).
- Rate limiting for connector tokens is per serverless instance (best effort); the database is the authority.
- Claude.ai / ChatGPT web connectors need OAuth, which is not built; tokens work for Claude Code, Cursor and bridged Claude Desktop.
- Interview scheduling is out of scope: after the reveal the company contacts the candidate directly.

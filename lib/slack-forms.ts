// Pure helpers for Slack modals and slash-command text. No I/O, so they are exactly testable.
import { z } from "zod";

export type SlackValues = Record<string, Record<string, { value?: string | null; selected_options?: { value: string }[] }>>;

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com",
  "proton.me", "protonmail.com", "aol.com", "rediffmail.com", "zoho.com", "mail.com", "gmx.com",
]);

// The company domain comes from the installer's Slack-verified email. Free-mail addresses are not a company.
export function companyDomainFromEmail(email: string | undefined | null): string | null {
  const d = email?.trim().toLowerCase().split("@")[1];
  if (!d || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) || FREE_MAIL.has(d)) return null;
  return d;
}

const lakhToInr = (lakh: number) => Math.round(lakh * 100_000);
const csv = (s: string | null | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const val = (v: SlackValues, block: string) => v?.[block]?.v?.value ?? "";

const roleSchema = z.object({
  title: z.string().trim().min(2).max(120),
  skills: z.array(z.string().max(30)).max(20),
  locations: z.array(z.string().max(40)).max(10),
  remote: z.boolean(),
  budgetMaxCtc: z.number().positive().max(1e9),
});
export type RoleSubmission = z.infer<typeof roleSchema>;

export function parseRoleSubmission(values: SlackValues): { ok: true; role: RoleSubmission } | { ok: false; errors: Record<string, string> } {
  const lakh = Number(val(values, "budget"));
  const parsed = roleSchema.safeParse({
    title: val(values, "title"), skills: csv(val(values, "skills")), locations: csv(val(values, "locations")),
    remote: (values?.remote?.v?.selected_options ?? []).some((o) => o.value === "remote"),
    budgetMaxCtc: Number.isFinite(lakh) && lakh > 0 ? lakhToInr(lakh) : NaN,
  });
  if (parsed.success) return { ok: true, role: parsed.data };
  const errors: Record<string, string> = {};
  for (const i of parsed.error.issues) {
    const key = i.path[0] === "budgetMaxCtc" ? "budget" : String(i.path[0]);
    errors[key] ??= key === "budget" ? "Enter the maximum CTC in lakh per year, e.g. 25" : key === "title" ? "Enter a role title (2-120 characters)" : "Invalid value";
  }
  return { ok: false, errors };
}

const offerSchema = z.object({
  title: z.string().trim().min(2).max(120),
  ctc_inr: z.number().positive().max(1e9),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type OfferSubmission = z.infer<typeof offerSchema>;

export function parseOfferSubmission(values: SlackValues): { ok: true; offer: OfferSubmission } | { ok: false; errors: Record<string, string> } {
  const lakh = Number(val(values, "ctc"));
  const parsed = offerSchema.safeParse({
    title: val(values, "title"), ctc_inr: Number.isFinite(lakh) && lakh > 0 ? lakhToInr(lakh) : NaN,
    start_date: val(values, "start") || undefined, notes: val(values, "notes") || undefined,
  });
  if (parsed.success) return { ok: true, offer: parsed.data };
  const errors: Record<string, string> = {};
  for (const i of parsed.error.issues) {
    const key = i.path[0] === "ctc_inr" ? "ctc" : i.path[0] === "start_date" ? "start" : String(i.path[0]);
    errors[key] ??= key === "ctc" ? "Enter the yearly CTC in lakh, e.g. 24" : key === "start" ? "Use YYYY-MM-DD" : "Invalid value";
  }
  return { ok: false, errors };
}

const input = (block_id: string, label: string, opts: { placeholder?: string; optional?: boolean; multiline?: boolean } = {}) => ({
  type: "input", block_id, optional: opts.optional ?? false, label: { type: "plain_text", text: label },
  element: { type: "plain_text_input", action_id: "v", multiline: opts.multiline ?? false, ...(opts.placeholder ? { placeholder: { type: "plain_text", text: opts.placeholder } } : {}) },
});

export const roleModal = () => ({
  type: "modal", callback_id: "post_role", title: { type: "plain_text", text: "Post a role" },
  submit: { type: "plain_text", text: "Post role" }, close: { type: "plain_text", text: "Cancel" },
  blocks: [
    input("title", "Role title", { placeholder: "Senior Backend Engineer" }),
    input("skills", "Skills (comma separated)", { placeholder: "TypeScript, Postgres, Node", optional: true }),
    input("locations", "Locations (comma separated)", { placeholder: "Bangalore", optional: true }),
    { type: "input", block_id: "remote", optional: true, label: { type: "plain_text", text: "Remote" },
      element: { type: "checkboxes", action_id: "v", options: [{ text: { type: "plain_text", text: "Remote is fine" }, value: "remote" }], initial_options: [{ text: { type: "plain_text", text: "Remote is fine" }, value: "remote" }] } },
    input("budget", "Maximum CTC (lakh per year) — private", { placeholder: "25" }),
    { type: "context", elements: [{ type: "mrkdwn", text: "The budget is *sealed*: it is used only to check fit and is never shown to candidates or sent to any AI model." }] },
  ],
});

export const offerModal = (threadId: string) => ({
  type: "modal", callback_id: "propose_offer", private_metadata: threadId, title: { type: "plain_text", text: "Propose an offer" },
  submit: { type: "plain_text", text: "Draft offer" }, close: { type: "plain_text", text: "Cancel" },
  blocks: [
    input("title", "Offer title", { placeholder: "Backend Engineer" }),
    input("ctc", "Yearly CTC (lakh)", { placeholder: "24" }),
    input("start", "Start date (YYYY-MM-DD)", { optional: true }),
    input("notes", "Notes", { optional: true, multiline: true }),
    { type: "context", elements: [{ type: "mrkdwn", text: "Nothing is sent yet. You will be asked to confirm before the candidate sees it." }] },
  ],
});

export type HireCommand = { kind: "post" | "roles" | "shortlist" | "help" } | { kind: "find"; index: number | null };
export function parseHireCommand(text: string): HireCommand {
  const [head, arg] = text.trim().toLowerCase().split(/\s+/);
  if (head === "post") return { kind: "post" };
  if (head === "roles") return { kind: "roles" };
  if (head === "shortlist") return { kind: "shortlist" };
  if (head === "find") { const n = Number(arg); return { kind: "find", index: Number.isInteger(n) && n > 0 ? n : null }; }
  return { kind: "help" };
}

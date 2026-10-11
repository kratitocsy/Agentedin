import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

const GRAPH = "https://graph.facebook.com/v21.0";
// No 0/O/1/I/L: codes get typed from a phone screen.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const whatsappConfigured = () =>
  Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN);

export const businessNumber = () => (process.env.WHATSAPP_BUSINESS_NUMBER ?? "").replace(/\D/g, "");

export function generateCode() {
  return `AGT-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;
}

// Meta signs the raw request body with the app secret (X-Hub-Signature-256: sha256=<hex>).
export function verifySignature(rawBody: string, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type Incoming = { from: string; id: string; text: string };

export function parseIncoming(payload: unknown): Incoming[] {
  const out: Incoming[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const e of entries) {
    for (const c of (e as { changes?: unknown[] })?.changes ?? []) {
      for (const m of (c as { value?: { messages?: unknown[] } })?.value?.messages ?? []) {
        const msg = m as { from?: string; id?: string; type?: string; text?: { body?: string } };
        if (msg.type === "text" && msg.from && msg.id && typeof msg.text?.body === "string") {
          out.push({ from: msg.from, id: msg.id, text: msg.text.body.slice(0, 200) });
        }
      }
    }
  }
  return out;
}

export type Command = { kind: "verify"; code: string } | { kind: "status" } | { kind: "help" } | { kind: "unknown" };

export function parseCommand(text: string): Command {
  const t = text.trim().toLowerCase();
  const v = t.match(/^verify\s+(agt-[a-z0-9]{6})$/);
  if (v) return { kind: "verify", code: v[1].toUpperCase() };
  if (t === "status") return { kind: "status" };
  if (t === "help" || t === "hi" || t === "hello") return { kind: "help" };
  return { kind: "unknown" };
}

// Meta sends numbers as digits with country code ("919876543210"); we store E.164.
export const toE164 = (digits: string) => `+${digits.replace(/\D/g, "")}`;

export async function sendText(toDigits: string, body: string) {
  if (!whatsappConfigured()) return;
  try {
    await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: toDigits, type: "text", text: { body } }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // A failed reply must never fail the webhook (Meta would retry and duplicate work).
  }
}

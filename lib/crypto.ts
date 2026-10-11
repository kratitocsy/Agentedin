// Server-side helpers. Keys are derived from the service-role key, which never leaves the server environment,
// so no extra secret has to be configured. Different purposes get different keys.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const root = () => {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return k;
};
const keyFor = (purpose: string) => createHmac("sha256", root()).update(`agentedin:${purpose}`).digest();

export function encrypt(plaintext: string, purpose: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFor(purpose), iv);
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return `v1.${Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64url")}`;
}

export function decrypt(blob: string, purpose: string) {
  if (!blob.startsWith("v1.")) throw new Error("bad_format");
  const raw = Buffer.from(blob.slice(3), "base64url");
  const d = createDecipheriv("aes-256-gcm", keyFor(purpose), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

// Signed, purpose-bound tokens for links we email out (e.g. unsubscribe). Not guessable, not transferable between purposes.
export const signValue = (purpose: string, value: string) => createHmac("sha256", keyFor(`sign:${purpose}`)).update(value).digest("hex").slice(0, 32);
export function verifySigned(purpose: string, value: string, sig: string) {
  const a = Buffer.from(signValue(purpose, value));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

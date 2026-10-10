import { createHmac } from "node:crypto";

const HANDLE = /^[A-Za-z0-9_.-]{3,24}$/;

export const isValidHandle = (h: string) => HANDLE.test(h);

// Stateless ownership challenge: only this server can compute it, and it is bound to the human and the handle.
// The user pastes it into their Codeforces profile (First name / Organization), we read it back via the public API.
export function verificationCode(humanId: string, handle: string) {
  const mac = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(`codeforces:${humanId}:${handle.toLowerCase()}`)
    .digest("hex");
  return `agentedin-${mac.slice(0, 10)}`;
}

export type CfUser = {
  handle: string;
  rating?: number;
  maxRating?: number;
  rank?: string;
  maxRank?: string;
  firstName?: string;
  lastName?: string;
  organization?: string;
};

export async function fetchCfUser(handle: string): Promise<CfUser | null> {
  const res = await fetch(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { status: string; result?: CfUser[] };
  return body.status === "OK" && body.result?.[0] ? body.result[0] : null;
}

export const codeAppearsOn = (u: CfUser, code: string) =>
  [u.firstName, u.lastName, u.organization].some((f) => f?.includes(code));

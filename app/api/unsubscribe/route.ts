import { NextResponse } from "next/server";
import { verifySigned } from "@/lib/crypto";
import { pauseNudges } from "@/lib/notify";

export const dynamic = "force-dynamic";
const page = (body: string, status = 200) =>
  new NextResponse(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agentedin</title><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">${body}`, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

const valid = (u: string | null, t: string | null) => !!u && !!t && /^[0-9a-f-]{36}$/.test(u) && verifySigned("unsubscribe", u, t);

// GET only shows a confirm button, so email scanners that pre-fetch links cannot unsubscribe anyone by accident.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  if (!valid(q.get("u"), q.get("t"))) return page("<h1>Link not valid</h1>", 400);
  return page(`<h1>Stop the weekly digest?</h1><form method="post"><input type="hidden" name="u" value="${q.get("u")}"><input type="hidden" name="t" value="${q.get("t")}"><button style="padding:.6rem 1rem">Unsubscribe</button></form>`);
}

export async function POST(request: Request) {
  const q = new URL(request.url).searchParams;
  const form = await request.formData().catch(() => null);
  const u = (form?.get("u") as string | null) ?? q.get("u");
  const t = (form?.get("t") as string | null) ?? q.get("t");
  if (!valid(u, t)) return page("<h1>Link not valid</h1>", 400);
  await pauseNudges(u!, "digest", 3650);
  return page("<h1>You are unsubscribed</h1><p>You will not get the weekly digest. Approvals you must act on will still be emailed.</p>");
}

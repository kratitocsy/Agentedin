import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Starts "Add to Slack". The state cookie ties the callback to this browser (CSRF protection).
export async function GET() {
  const id = process.env.SLACK_CLIENT_ID;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!id || !site) return new NextResponse("Slack is not configured", { status: 503 });
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", id);
  url.searchParams.set("scope", "chat:write,commands,im:write,users:read,users:read.email");
  url.searchParams.set("redirect_uri", `${site}/api/slack/oauth`);
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  res.cookies.set("slack_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/api/slack" });
  return res;
}

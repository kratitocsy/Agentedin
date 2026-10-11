import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, rateLimited } from "@/lib/agent/tokens";
import { callTool, toolsFor } from "@/lib/agent/tools";

export const dynamic = "force-dynamic";

// REST twin of the MCP endpoint for agents that prefer plain HTTP (e.g. OpenClaw skills).
// GET lists the tools this token can use; POST {"tool": "...", "arguments": {...}} calls one.
export async function GET(request: Request) {
  const ctx = await authenticate(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  return NextResponse.json({ tools: toolsFor(ctx).map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })) });
}

export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  if (rateLimited(ctx.tokenId)) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "30" } });
  const body = z.object({ tool: z.string().max(80), arguments: z.record(z.string(), z.unknown()).optional() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const out = await callTool(ctx, body.data.tool, body.data.arguments);
  return NextResponse.json(out.ok ? { result: out.result } : { error: out.code, message: out.message }, { status: out.ok ? 200 : out.code === "internal" ? 500 : 400 });
}

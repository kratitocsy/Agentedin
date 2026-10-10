import { NextResponse } from "next/server";
import { handleRpc } from "@/lib/agent/mcp";
import { authenticate, rateLimited } from "@/lib/agent/tokens";

export const dynamic = "force-dynamic";
const MAX_BODY = 100_000;
const MAX_BATCH = 20;
const json = (body: unknown, init?: ResponseInit) => NextResponse.json(body, init);

// MCP "streamable HTTP", stateless: one JSON-RPC request in, one JSON response out. Auth: Authorization: Bearer agt_...
export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (!ctx) return json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  if (rateLimited(ctx.tokenId)) return json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "30" } });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }

  const items = Array.isArray(body) ? body : [body];
  if (items.length === 0 || items.length > MAX_BATCH) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid batch size" } }, { status: 400 });
  const responses = (await Promise.all(items.map((i) => handleRpc(ctx, i)))).filter((r) => r !== null);
  if (!responses.length) return new NextResponse(null, { status: 202 });
  return json(Array.isArray(body) ? responses : responses[0]);
}

export const GET = () => new NextResponse("This MCP endpoint is stateless; use POST.", { status: 405, headers: { Allow: "POST" } });
export const DELETE = GET;

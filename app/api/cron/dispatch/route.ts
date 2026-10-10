import { NextResponse } from "next/server";
import { dispatch } from "@/lib/jobs/runner";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called by pg_cron (via pg_net) every minute. The secret lives only in Supabase Vault; we verify it by asking the database.
export async function POST(request: Request) {
  const m = request.headers.get("authorization")?.match(/^Bearer ([0-9a-f]{64})$/);
  if (!m) return new NextResponse("Unauthorized", { status: 401 });
  const { data: ok } = await createAdminClient().rpc("verify_cron_secret", { candidate: m[1] });
  if (!ok) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await dispatch());
}

export const GET = () => new NextResponse("POST only", { status: 405, headers: { Allow: "POST" } });

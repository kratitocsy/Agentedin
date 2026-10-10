"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { DEV_SCOPES, mintToken, revokeToken } from "@/lib/agent/tokens";
import { createClient } from "@/lib/supabase/server";

export type MintState = { token?: string; error?: string };

export async function mint(_prev: MintState, formData: FormData): Promise<MintState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const scopes = formData.getAll("scope").map(String).filter((s) => (DEV_SCOPES as readonly string[]).includes(s));
  if (scopes.includes("approvals:decide") && formData.get("understand") !== "on") {
    return { error: "To let a token approve for you, tick the confirmation box." };
  }
  const name = z.string().trim().min(1).max(60).safeParse(formData.get("name"));
  if (!name.success) return { error: "Give the connection a name, like “Claude Desktop”." };
  try {
    const token = await mintToken({ humanId: user.id }, name.data, scopes, 90);
    await audit({ actor: "human", humanId: user.id, action: "token.created", entity: "agent_token", details: { name: name.data, scopes } });
    revalidatePath("/connect");
    return { token };
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return { error: m === "too_many_tokens" ? "You have 10 active connections. Revoke one first." : m === "scopes_required" ? "Pick at least one permission." : "Could not create the connection." };
  }
}

export async function revoke(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (id.success) {
    await revokeToken(user.id, id.data);
    await audit({ actor: "human", humanId: user.id, action: "token.revoked", entity: "agent_token", entityId: id.data });
  }
  revalidatePath("/connect");
}

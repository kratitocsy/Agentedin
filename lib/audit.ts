import type { Json } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";

// Server only. audit_events has no insert policy for browser roles; the service key is the sole writer.
export async function audit(e: {
  actor: "human" | "agent" | "system";
  humanId: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  details?: Record<string, Json>;
}) {
  const { error } = await createAdminClient().from("audit_events").insert({
    actor: e.actor,
    human_id: e.humanId,
    action: e.action,
    entity: e.entity ?? null,
    entity_id: e.entityId ?? null,
    details: e.details ?? {},
  });
  if (error) throw new Error(`audit write failed: ${error.message}`);
}

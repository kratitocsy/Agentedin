import { pool } from "../db.js";

export async function audit(
  actorId: number | null,
  action: string,
  entity?: string,
  entityId?: string | number,
  details: Record<string, unknown> = {},
) {
  await pool.query(
    "INSERT INTO audit_log (actor_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
    [actorId, action, entity ?? null, entityId?.toString() ?? null, details],
  );
}

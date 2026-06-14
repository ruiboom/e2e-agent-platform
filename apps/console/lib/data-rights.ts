// Retention + DSAR (data subject rights) over the data stores that hold personal
// data (chat_log today). Every action writes an audit event (H1).
import "server-only";

import { appendAudit } from "@agent-platform/lineage-client";

import { pool } from "@/lib/db";

/** Purge chat logs older than `days`. Returns the number of rows removed. */
export async function purgeChatLogs(days: number, actor: string): Promise<{ purged: number }> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(
      `DELETE FROM chat_log WHERE created_at < now() - ($1::int * interval '1 day')`,
      [days],
    );
    await appendAudit(client, {
      actor, action: "retention.purge", actorKind: "service",
      targetType: "chat_log", meta: `older_than:${days}d`, payload: { purged: res.rowCount, days },
    });
    await client.query("COMMIT");
    return { purged: res.rowCount ?? 0 };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** DSAR access — export everything held about a data subject. */
export async function exportSubject(userId: string): Promise<Record<string, unknown>> {
  const chat = await pool().query(
    "SELECT id, project_id, agent_version_id, question, answer, created_at FROM chat_log WHERE user_id=$1 ORDER BY created_at",
    [userId],
  );
  const academy = await pool().query(
    "SELECT role_path, stage_id, completed_at FROM academy_progress WHERE user_id=$1",
    [userId],
  );
  return { user_id: userId, chat_log: chat.rows, academy_progress: academy.rows };
}

/** DSAR erasure — delete everything held about a data subject. */
export async function eraseSubject(userId: string, actor: string): Promise<{ chat_log: number; academy_progress: number }> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const chat = await client.query("DELETE FROM chat_log WHERE user_id=$1", [userId]);
    const academy = await client.query("DELETE FROM academy_progress WHERE user_id=$1", [userId]);
    await appendAudit(client, {
      actor, action: "dsar.erase", actorKind: "service",
      targetType: "data_subject", targetId: userId, meta: "erase",
      payload: { chat_log: chat.rowCount, academy_progress: academy.rowCount },
    });
    await client.query("COMMIT");
    return { chat_log: chat.rowCount ?? 0, academy_progress: academy.rowCount ?? 0 };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

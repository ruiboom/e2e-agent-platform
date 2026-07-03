// Prompt-set admin proxy (model-router registry). Dispatch on { action, ... }.
//
//   GET                       -> full prompt set + drafts + bundle history
//   draft   { key, template } -> save a working draft (live for routing at once)
//   discard { key }           -> drop a draft (routing reverts to the active set)
//   approve {}                -> promote all drafts + snapshot the FULL prompt
//                                set as the next immutable bundle version
//
// All of it needs prompt:activate (admin) — this is the platform's engine room.
// Approvals land in the audit chain.
import { NextResponse } from "next/server";

import { appendAudit } from "@agent-platform/lineage-client";

import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { can } from "@/lib/rbac";

const ROUTER = (process.env.MODEL_ROUTER_URL || "http://localhost:8789").replace(/\/$/, "");

async function guard() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  if (!can(session.role, "prompt:activate")) {
    return { error: NextResponse.json({ error: "forbidden: prompt:activate" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const { session, error } = await guard();
  if (!session) return error;
  try {
    const res = await fetch(`${ROUTER}/v1/prompt-set`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: `model-router unreachable: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  const { session, error } = await guard();
  if (!session) return error;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action as string | undefined;

  try {
    let res: Response;
    switch (action) {
      case "draft": {
        if (!body.key || typeof body.template !== "string") {
          return NextResponse.json({ error: "key and template are required" }, { status: 400 });
        }
        res = await fetch(`${ROUTER}/v1/prompt-set/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: body.key, template: body.template, updated_by: session.userId }),
        });
        break;
      }
      case "discard": {
        if (!body.key) return NextResponse.json({ error: "key is required" }, { status: 400 });
        res = await fetch(`${ROUTER}/v1/prompt-set/draft/${encodeURIComponent(body.key as string)}`, {
          method: "DELETE",
        });
        break;
      }
      case "approve": {
        res = await fetch(`${ROUTER}/v1/prompt-set/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved_by: session.userId }),
        });
        if (res.ok) {
          const out = (await res.clone().json()) as { version: number; prompt_count: number; promoted: string[] };
          const client = await pool().connect();
          try {
            await client.query("BEGIN");
            await appendAudit(client, {
              actor: session.userId,
              action: "prompt_bundle.approve",
              targetType: "prompt_bundle",
              targetId: String(out.version),
              meta: `v${out.version}:${out.prompt_count} prompts (${out.promoted.join(",")})`,
              payload: out as unknown as Record<string, unknown>,
            });
            await client.query("COMMIT");
          } catch {
            await client.query("ROLLBACK");
          } finally {
            client.release();
          }
        }
        break;
      }
      default:
        return NextResponse.json({ error: `unknown action '${action}'` }, { status: 400 });
    }
    const data = await res.json().catch(() => ({ error: "non-JSON from model-router" }));
    return NextResponse.json(data as object, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: `model-router unreachable: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}

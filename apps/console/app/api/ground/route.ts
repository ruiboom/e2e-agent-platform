// Ground (Knowledge) proxy: point at sources -> ingest -> four-eyes approve ->
// release -> enrich. Keeps the ground service URL off the browser and injects
// identity. Dispatch on { action, projectId, ... }.
//
//   ingest  { docs:[{uri,title,body}], submittedBy }   -> artifact:write
//   connect { kind, url?, content?, paths?, submittedBy } -> artifact:write
//   approve { revisionId }                               -> artifact:approve (four-eyes in service)
//   release { kbOutlineArtifactId? , enrich? }           -> artifact:write
//   enrich  { releaseKey }                               -> artifact:write
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { can, type Capability } from "@/lib/rbac";

const GROUND = (process.env.GROUND_URL || "http://localhost:8790").replace(/\/$/, "");

async function call(path: string, body: unknown, userId: string, role: string) {
  const res = await fetch(`${GROUND}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-AP-User": userId, "X-AP-Role": role },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: "non-JSON from ground" }));
  return { data, status: res.status };
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action as string | undefined;
  const projectId = body.projectId as string | undefined;
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const require = (cap: Capability) => {
    if (!can(session.role, cap)) {
      return NextResponse.json({ error: `forbidden: ${cap}` }, { status: 403 });
    }
    return null;
  };

  try {
    let out: { data: unknown; status: number };
    switch (action) {
      case "ingest": {
        const denied = require("artifact:write");
        if (denied) return denied;
        const docs = body.docs;
        if (!Array.isArray(docs) || docs.length === 0) {
          return NextResponse.json({ error: "docs[] is required" }, { status: 400 });
        }
        out = await call(
          "/v1/ingest",
          { project_id: projectId, docs, submitted_by: (body.submittedBy as string) || session.userId },
          session.userId,
          session.role,
        );
        break;
      }
      case "connect": {
        const denied = require("artifact:write");
        if (denied) return denied;
        if (!body.kind) return NextResponse.json({ error: "kind is required" }, { status: 400 });
        out = await call(
          "/v1/connect",
          {
            project_id: projectId,
            kind: body.kind,
            url: body.url ?? null,
            content: body.content ?? null,
            paths: body.paths ?? null,
            submitted_by: (body.submittedBy as string) || session.userId,
          },
          session.userId,
          session.role,
        );
        break;
      }
      case "approve": {
        const denied = require("artifact:approve");
        if (denied) return denied;
        if (!body.revisionId) return NextResponse.json({ error: "revisionId is required" }, { status: 400 });
        // approver is always the acting user (accountability + four-eyes check).
        out = await call("/v1/approve", { revision_id: body.revisionId, approver: session.userId }, session.userId, session.role);
        break;
      }
      case "release": {
        const denied = require("artifact:write");
        if (denied) return denied;
        out = await call(
          "/v1/release",
          { project_id: projectId, kb_outline_artifact_id: (body.kbOutlineArtifactId as string) ?? null },
          session.userId,
          session.role,
        );
        // Enrich the graph for the fresh release unless the caller opted out.
        if (out.status < 300 && body.enrich !== false) {
          const releaseKey = (out.data as { release_key?: string }).release_key;
          if (releaseKey) {
            const enr = await call("/v1/enrich", { project_id: projectId, release_key: releaseKey }, session.userId, session.role);
            out = { data: { ...(out.data as object), enrich: enr.data }, status: out.status };
          }
        }
        break;
      }
      case "enrich": {
        const denied = require("artifact:write");
        if (denied) return denied;
        if (!body.releaseKey) return NextResponse.json({ error: "releaseKey is required" }, { status: 400 });
        out = await call("/v1/enrich", { project_id: projectId, release_key: body.releaseKey }, session.userId, session.role);
        break;
      }
      default:
        return NextResponse.json({ error: `unknown action '${action}'` }, { status: 400 });
    }
    return NextResponse.json(out.data as object, { status: out.status });
  } catch (e) {
    return NextResponse.json(
      { error: `ground unreachable: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}

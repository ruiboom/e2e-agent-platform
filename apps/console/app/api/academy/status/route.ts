// Live platform signals for Academy — enablement reads from the running services
// so the docs never drift from the product.
import { NextResponse } from "next/server";

import { serviceHealth } from "@/lib/academy";
import { getSession } from "@/lib/auth";
import { STAGES } from "@/lib/enablement";
import { lineage } from "@/lib/lineage";

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const services = await serviceHealth();
  const projects = (await lineage().listProjects()).length;
  const liveStages = STAGES.filter((s) => services[s.service]).length;
  return NextResponse.json({ stages: STAGES.length, liveStages, services, projects });
}

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agent-platform/design-system";

import { getProgress, serviceHealth } from "@/lib/academy";
import { getSession } from "@/lib/auth";
import { ROLE_PATHS, STAGES, stageById } from "@/lib/enablement";
import { AcademyPath } from "@/components/AcademyPath";

export const dynamic = "force-dynamic";

const PHASES = ["Shape & plan", "Make", "Prove", "Run & improve"] as const;

export default async function AcademyPage() {
  const session = await getSession();
  const health = await serviceHealth();
  const liveStages = STAGES.filter((s) => health[s.service]).length;

  const paths = await Promise.all(
    Object.values(ROLE_PATHS).map(async (p) => ({
      path: p,
      done: session ? await getProgress(session.userId, p.id) : [],
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl font-black text-ink">Academy</h1>
        <p className="text-ink-2">
          Per-stage enablement that reads live from the platform.{" "}
          <Badge tone={liveStages === STAGES.length ? "success" : "neutral"}>
            {liveStages}/{STAGES.length} stages live
          </Badge>
        </p>
      </div>

      {/* Per-stage contextual help, mapped 1:1 to the 11 stages */}
      <div className="grid gap-4">
        {PHASES.map((phase) => (
          <Card key={phase}>
            <CardHeader>
              <CardTitle>{phase}</CardTitle>
              <CardDescription>How each stage works.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {STAGES.filter((s) => s.phase === phase).map((s) => (
                <div key={s.id} className="flex items-start gap-2 rounded-md border border-line p-3">
                  <Badge tone={health[s.service] ? "success" : "danger"}>{health[s.service] ? "live" : "down"}</Badge>
                  <div>
                    <div className="font-bold text-ink">{s.name}</div>
                    <div className="text-[13px] text-ink-3">{s.blurb}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Role paths */}
      <h2 className="font-display text-2xl font-black text-ink">Role paths</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {paths.map(({ path, done }) => (
          <AcademyPath
            key={path.id}
            pathId={path.id}
            name={path.name}
            stages={path.stages.map((id) => {
              const s = stageById(id)!;
              return { id: s.id, name: s.name, blurb: s.blurb };
            })}
            initialDone={done}
          />
        ))}
      </div>
    </div>
  );
}

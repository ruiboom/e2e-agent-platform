// Academy enablement: the 11 pipeline stages mapped 1:1 to contextual help +
// role paths. `service` ties a stage to a live platform service (health read);
// `route` points at the live stage UI so docs never drift from the product.

export interface Stage {
  id: string;
  name: string;
  phase: "Shape & plan" | "Make" | "Prove" | "Run & improve";
  blurb: string;
  service: "router" | "ground" | "build" | "eval" | "optimise";
  route: string; // template, :slug filled per project
}

export const STAGES: Stage[] = [
  { id: "discover", name: "Discover", phase: "Shape & plan", service: "router", route: "/projects/:slug/shape",
    blurb: "Validate that a problem is real and roughly feasible — emits a scored opportunity artifact." },
  { id: "define", name: "Define", phase: "Shape & plan", service: "router", route: "/projects/:slug/shape",
    blurb: "Turn an opportunity into a crisp proposition; sign-off feeds Gate 1." },
  { id: "specify", name: "Specify", phase: "Shape & plan", service: "router", route: "/projects/:slug/specify",
    blurb: "Produce the scope, system prompt and KB outline — the genesis spec artifacts." },
  { id: "architect", name: "Architect", phase: "Shape & plan", service: "router", route: "/projects/:slug/shape",
    blurb: "Lock the technical shape (build paradigm, retrieval strategy, channels) as an ADR." },
  { id: "plan", name: "Plan", phase: "Shape & plan", service: "router", route: "/projects/:slug/shape",
    blurb: "A costed, staffed plan with a Jira-importable CSV." },
  { id: "ground", name: "Ground", phase: "Make", service: "ground", route: "/projects/:slug/chat",
    blurb: "The knowledge kernel: governed canonical store, six retrieval modes, pinned releases." },
  { id: "build", name: "Build", phase: "Make", service: "build", route: "/projects/:slug/chat",
    blurb: "Produce a runnable agent_version via canvas, flow, YAML or generative paradigms." },
  { id: "test", name: "Test", phase: "Prove", service: "eval", route: "/projects/:slug/chat",
    blurb: "Generate a multi-persona test suite with coverage tags." },
  { id: "evaluate", name: "Evaluate", phase: "Prove", service: "eval", route: "/projects/:slug/chat",
    blurb: "Quality + latency + cost scoring; Gate 2 blocks a failing agent before deploy." },
  { id: "deploy", name: "Deploy", phase: "Run & improve", service: "build", route: "/projects/:slug/chat",
    blurb: "Run across targets + channels with runtime guardrails and provenance on every answer." },
  { id: "operate", name: "Operate", phase: "Run & improve", service: "optimise", route: "/projects/:slug/chat",
    blurb: "Learn from live logs and auto-propose an improved system prompt — closing the loop." },
];

export interface RolePath {
  id: string;
  name: string;
  stages: string[];
}

export const ROLE_PATHS: Record<string, RolePath> = {
  "conversation-designer": { id: "conversation-designer", name: "Conversation Designer", stages: ["specify", "build", "test"] },
  "knowledge-engineer": { id: "knowledge-engineer", name: "Knowledge Engineer", stages: ["architect", "ground", "evaluate"] },
  "platform-operator": { id: "platform-operator", name: "Platform Operator", stages: ["deploy", "operate", "evaluate"] },
};

export function stageById(id: string): Stage | undefined {
  return STAGES.find((s) => s.id === id);
}

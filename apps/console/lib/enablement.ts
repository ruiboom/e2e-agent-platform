// Academy enablement: the 11 pipeline stages mapped 1:1 to contextual help +
// role paths. `service` ties a stage to a live platform service (health read);
// `route` points at the live stage UI so docs never drift from the product.

// The single seeded project the Academy links into so you can explore real outputs.
export const EXAMPLE_PROJECT = "overdraft-assistant";

export interface Stage {
  id: string;
  name: string;
  phase: "Shape & plan" | "Make" | "Prove" | "Run & improve";
  blurb: string;
  service: "router" | "ground" | "build" | "eval" | "optimise";
  route: string; // template, :slug filled per project
  howItWorks: string;
  reads: string;
  writes: string;
}

export const STAGES: Stage[] = [
  { id: "discover", name: "Discover", phase: "Shape & plan", service: "router", route: "/projects/:slug/shape",
    blurb: "Validate that a problem is real and roughly feasible — emits a scored opportunity artifact.",
    howItWorks: "You enter a problem statement. The model-router restates it, gathers supporting evidence, and scores feasibility + uncertainty (1–3). The result is the genesis artifact of the whole thread; rejected opportunities are retained, not deleted.",
    reads: "the project", writes: "opportunity" },
  { id: "define", name: "Define", phase: "Shape & plan", service: "router", route: "/projects/:slug/shape",
    blurb: "Turn an opportunity into a crisp proposition; sign-off feeds Gate 1.",
    howItWorks: "From the opportunity, Define produces a proposition (target user, need, capabilities, success metrics, ToV, feasibility + compliance pre-checks). Signing off creates a new signed-off version — one of the two conditions for Gate 1. Sign-off needs an approver role (separation of duties).",
    reads: "opportunity", writes: "proposition (draft → signed_off)" },
  { id: "specify", name: "Specify", phase: "Shape & plan", service: "router", route: "/projects/:slug/specify",
    blurb: "Produce the scope, system prompt and KB outline — the genesis spec artifacts.",
    howItWorks: "One model-router call turns a topic into three linked artifacts at once: a sectioned scope, a production-ready system prompt, and the knowledge-base topics to ground the agent. They appear in Outputs on the page — read them rendered, or edit one into a new version before Build picks it up. These feed Build and Ground.",
    reads: "a signed-off proposition (if present)", writes: "scope, system_prompt, kb_outline" },
  { id: "architect", name: "Architect", phase: "Shape & plan", service: "router", route: "/projects/:slug/architect",
    blurb: "Design the agent as an editable graph (canvas); saved as the ADR that drives Build.",
    howItWorks: "An editable canvas of the agent graph — input → guardrails → retrieve → generate → output, plus tools. Drag, connect, and edit each node; the retrieve node sets the retrieval strategy and the generate node sets the build paradigm. Saving captures the whole graph as the ADR artifact. Invalid combinations are rejected (e.g. graph retrieval without a graph projection).",
    reads: "scope (+ constraints)", writes: "adr (with the agent graph)" },
  { id: "plan", name: "Plan", phase: "Shape & plan", service: "router", route: "/projects/:slug/shape",
    blurb: "A costed, staffed plan with a Jira-importable CSV — then Gate 1.",
    howItWorks: "From scope + ADR, Plan produces epics → stories → tasks with estimates, a resourcing list, and a CSV. Gate 1 then checks that the proposition is signed off and an ADR exists before Make can begin.",
    reads: "scope + adr", writes: "plan, gate1" },
  { id: "ground", name: "Ground", phase: "Make", service: "ground", route: "/projects/:slug/ground",
    blurb: "The knowledge kernel: point at sources, ingest, govern, pin a release. Can run up front.",
    howItWorks: "Point at sources (paste, web, RSS, GitHub) on the Knowledge page; each revision is scanned and SUBMITTED, then a different actor APPROVES it (four-eyes). Expand any document to read it rendered, or edit it — the edit lands as the next revision and goes back through four-eyes. Approved revisions are chunked, embedded (pgvector), and graph-enriched (Neo4j). Cut a release to pin the approved revisions — that release is what an agent consumes. Six retrieval modes: vector, lexical, hybrid, graph, graph_hybrid.",
    reads: "sources + kb_outline", writes: "kb_release (canonical store + projections)" },
  { id: "build", name: "Build", phase: "Make", service: "build", route: "/projects/:slug/chat",
    blurb: "Produce a runnable agent_version (code / canvas / flow / yaml / langgraph / generative).",
    howItWorks: "Combine the system prompt + a pinned release into a runnable agent_version, using the paradigm + retrieval strategy from the ADR. The langgraph paradigm runs a real compiled StateGraph; others share the inline RAG runtime. Each answer carries a provenance tuple.",
    reads: "system_prompt + kb_release (+ adr)", writes: "agent_version" },
  { id: "test", name: "Test", phase: "Prove", service: "eval", route: "/projects/:slug/evaluate",
    blurb: "Generate a multi-persona test suite with coverage tags.",
    howItWorks: "From the agent's system prompt, generate personas + tagged test cases (topic / behaviour / scope-boundary / out-of-scope). The suite is an artifact like any other — open it in the Artifacts card to read every case, or edit it into a new version before running. Evaluate runs the agent against it, persona by persona.",
    reads: "agent_version", writes: "test_suite" },
  { id: "evaluate", name: "Evaluate", phase: "Prove", service: "eval", route: "/projects/:slug/evaluate",
    blurb: "Quality + latency + cost scoring; Gate 2 (+ policy) blocks a failing agent before deploy.",
    howItWorks: "Run the suite, judge each answer with an LLM, and aggregate quality / latency / cost with a per-persona rollup. Gate 2 checks the result against the project's thresholds AND OPA-style policy rules (with a risk tier) — deploy is blocked unless it passes.",
    reads: "agent_version + test_suite", writes: "eval_run, gate2" },
  { id: "deploy", name: "Deploy", phase: "Run & improve", service: "build", route: "/projects/:slug/chat",
    blurb: "Run across targets + channels with runtime guardrails and provenance on every answer.",
    howItWorks: "Emit a deployment for an agent across targets + channels with a guardrail policy. Deploy enforces Gate 2. At runtime, prompt-injection is blocked + escalated and PII is redacted (input and output); every answer returns its provenance tuple.",
    reads: "agent_version + policy", writes: "deployment" },
  { id: "operate", name: "Operate", phase: "Run & improve", service: "optimise", route: "/projects/:slug/operate",
    blurb: "Learn from live logs and auto-propose an improved system prompt — closing the loop.",
    howItWorks: "Every chat turn is logged with its retrieval score. Operate diagnoses weak/off-topic turns and proposes an improved system prompt — emitted as a NEW system_prompt version that re-enters the pipeline (rebuild to adopt it). Open any proposal to read the full prompt + rationale, or edit it further before rebuilding. It's a proposal, never auto-promoted.",
    reads: "chat logs + system_prompt", writes: "system_prompt (next version)" },
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

// Live route into the example project for a stage.
export function exampleRoute(stage: Stage): string {
  return stage.route.replace(":slug", EXAMPLE_PROJECT);
}

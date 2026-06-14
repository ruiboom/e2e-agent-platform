# 01 · Seed mapping

For every module on the backbone: the existing app that becomes its **starting codebase**, its current stack, the folder path (under `../` in `CLAUDE SANDBOXES`), and the verdict.

**Verdict legend**
- **KERNEL** — the central component; adopt and deepen.
- **ADOPT** — take largely as-is; wire to the spine.
- **EXTEND** — use as the seed codebase, then add new capability.
- **PORT-UI** — logic is fine; rebuild the UI into the Next.js console.
- **LIBRARY-IFY** — extract the logic into a shared service/lib; drop its standalone UI.
- **NEW** — net-new build (see `04-net-new.md`).
- **SEPARATE-CLIENT** — stays its own client app, talks to the same services.

---

## Spine / foundations (shared by Agent Platform + Academy)

| Module | Seed app | Path | Current stack | Verdict |
|---|---|---|---|---|
| Console / shell + launcher | DEMO_LAUNCHER | `../DEMO_LAUNCHER` | Node, zero-dep vanilla HTML/JS | EXTEND — keep the app-registry/launch model; rebuild as the Next.js console |
| Cost observability | cost-tracker | `../cost-tracker` | FastAPI + SQLite(WAL) + vanilla JS + Chart.js + Python client | ADOPT — run as the cost service; add a TS client; feed it from the model router |
| Feedback | feedback-tracker | `../feedback-tracker` | FastAPI + SQLite(FTS5) + JS widget + server SDK | ADOPT — service as-is; widget → `packages/feedback-widget` |
| Design system | lloyds-design | `../lloyds-design` | CSS tokens + React kits + Astro docs | ADOPT — → `packages/design-system` |

---

## Agent Platform — Phase A (Shape & plan)

| Stage | Seed app(s) | Path | Current stack | Verdict |
|---|---|---|---|---|
| 1 Discover | experiment-management-system | `../experiment-management-system` | Next.js + Prisma + SQLite(dev)/Postgres | EXTEND — Postgres; this is also the Define seed |
| 1 Discover — external-input analysis | news.facts | `../news.facts` | FastAPI + Postgres/pgvector + sentence-transformers (MiniLM) + Claude | LIBRARY-IFY — clustering + ≥2-source corroboration + loaded-language stripping → a `signal-analysis` module; drop the news UI |
| 1 Discover — research synthesis | news-agents | `../news-agents` | Python claude-agent-sdk + Astro | LIBRARY-IFY — the editor→research→writer→QA pattern → a research-pack generator; drop Astro publishing |
| 2 Define | experiment-management-system + **research→proposition tool** | `../experiment-management-system` | (as above) | NEW module on the experiment-mgmt seed — see `04-net-new.md` |
| 3 Specify | scope-maker | `../scope-maker` | Next.js + Anthropic, file output | EXTEND — persist scope/system-prompt/KB-outline as lineage artifacts |
| 3 Specify — tone-of-voice overlay | style-ripper | `../style-ripper` | Next.js + SQLite + mammoth/pdf-parse | LIBRARY-IFY — voice-extraction → a ToV overlay module |
| 3 Specify — prompt refinement | prompt-improver | `../prompt-improver` | Flask + vanilla JS + Anthropic + LLMLingua | PORT-UI — logic into the prompt registry/tooling; UI into console |
| 4 Architect | **ADR / architecture tool** | — | — | NEW — small console module; ADR capture (runtime, retrieval strategy, projections, channels, deploy target, guardrail policy) |
| 5 Plan | jira-ticket-builder | `../jira-ticket-builder` | Next.js + Zustand + Anthropic | EXTEND — consume scope + ADR artifacts; keep CSV export |
| 5 Plan — resourcing | resource-planner | `../resource-planner` | FastAPI + Next.js + JSON files + Anthropic | ADOPT — move JSON → Postgres |

---

## Agent Platform — Phase B (Make)

| Stage | Seed app(s) | Path | Current stack | Verdict |
|---|---|---|---|---|
| 6 Ground — **kernel** | knowledge-management-system | `../knowledge-base-platform` | Node 22 API + React workbench + Postgres/pgvector + Python Scrapling sidecar | **KERNEL** — canonical store + governance + projections; deepen |
| 6 Ground — graph + hybrid RAG serve | graphBOT | `../graphBOT` | Python FastAPI + Chroma + Neo4j + FastMCP | LIBRARY-IFY — graph lookup/traverse/hybrid + MCP tools into the ground service |
| 6 Ground — KG enrichment | graph-enricher | `../graph-enricher` | Python + Neo4j + Anthropic | LIBRARY-IFY — gazetteer + LLM extraction + relationship discovery as an enrichment job |
| 6 Ground — ingest/cleaners | simple-scraper | `../simple-scraper` | Python Streamlit + Scrapling + Click | LIBRARY-IFY — sitemap/crawl + per-domain/LLM cleaners into ingest; drop Streamlit |
| 6 Ground — connectors | **RSS, GitHub, Confluence/Jira, STT** | — | — | NEW — see `04-net-new.md` |
| 7 Build — canvas/graph + LangGraph | AF | `../AF` | Python FastAPI + LangGraph + React Flow + Postgres/pgvector | EXTEND — primary build seed + LangGraph runtime |
| 7 Build — YAML multi-agent | flexi-agent-framework | `../flexi-agent-framework` | Python LangGraph + FastAPI + Next.js + Ollama | EXTEND — multi-agent topologies + builtin tools |
| 7 Build — conversational flow | VCBL | `../VCBL` | Next.js + Anthropic + React Flow | EXTEND — flow builder + Watson/Dialogflow export |
| 7 Build — Visio import | visioXfable5 | `../visioXfable5` | Python stdlib + Flask | LIBRARY-IFY — Visio→flow import library |
| 7 Build — LLM gateway (deterministic bots) | external-processing-manager | `../external-processing-manager` | FastAPI + Svelte | PORT-UI — gateway service kept; Svelte admin → console |
| 7 Build — generative builder | **generative agent builder** | — | — | NEW — sequence AFTER deterministic paths work (`04-net-new.md`) |

---

## Agent Platform — Phase C (Prove)

| Stage | Seed app(s) | Path | Current stack | Verdict |
|---|---|---|---|---|
| 8 Test — personas/coverage | CHATBOT_TEST_SET_GENERATOR | `../CHATBOT_TEST_SET_GENERATOR` | Python Gradio + Anthropic/Vertex | PORT-UI — persona/coverage/test-gen service; Gradio → console |
| 8 Test — structure + vision | CHATBOT_REGRESSION | `../CHATBOT_REGRESSION` | FastAPI + React + NetworkX + Claude vision | ADOPT — path/vision regression suite |
| 8 Test — synthetic multi-turn | AF | `../AF` | (as above) | ADOPT — reuse AF's synthetic test generation |
| 8 Test — multi-persona runner | **multi-persona runner** | — | — | NEW |
| 9 Evaluate | chat-eval | `../chat-eval` | Next.js + Drizzle/SQLite + React Flow + DeepEval (Python) | EXTEND — Postgres; add latency+cost; manager UX; flexible log import |
| 9 Evaluate — runtime gates | customer-facing-agentic-service | `../customer-facing-agentic-service` | Python ADK/Gemini + Vue + FastAPI | LIBRARY-IFY — the 4 eval suites (intent/risk/abstention/groundedness) as gates |

---

## Agent Platform — Phase D (Run & improve)

| Stage | Seed app(s) | Path | Current stack | Verdict |
|---|---|---|---|---|
| 10 Deploy — deterministic runtime + guardrails + agent-desk | customer-facing-agentic-service | `../customer-facing-agentic-service` | Python ADK/Gemini + Vue + FastAPI | EXTEND — ADK state-machine runtime + PII/risk/OPA + handoff; Vue → console |
| 10 Deploy — channels/runtime/memory/scheduling | hermes-desktop-main | `../hermes-desktop-main` | Electron + React + better-sqlite3 | SEPARATE-CLIENT — desktop client + 16 gateways; talks to platform services |
| 10 Deploy — accessible web chat/widget | ally-standalone | `../ally-standalone` | Flask + Claude + 20+ a11y features | PORT-UI — front-end/widget served by console; logic → deploy service |
| 10 Deploy — Watson/Dialogflow export | VCBL / visioXfable5 | (as above) | — | ADOPT — reuse export paths |
| 10 Deploy — LivePerson | markdown-to-lp | `../markdown-to-lp` | Python stdlib | ADOPT — output formatter library |
| 10 Deploy — voice channel (SSML) | text-to-voice-redesigner | `../text-to-voice-redesigner` | React/Express + Web Speech | LIBRARY-IFY — spoken rewrite + SSML; flags the STT gap (NEW) |
| 11 Operate — intent optimisation | intent-optimiser | `../intent-optimiser` | FastAPI + React + Claude | EXTEND — detect→diagnose→prescribe over live logs |
| 11 Operate — self-improving prompts | rewriter-admin | `../rewriter-admin` | Next.js + better-sqlite3 + Claude Sonnet/Opus | EXTEND — feedback→draft→test→judge→auto-promote loop |

---

## Academy (on the backbone)

| Module | Seed app(s) | Path | Current stack | Verdict |
|---|---|---|---|---|
| Course player + progress + gamification | A-level-revision | `../A-level-revision` | Next.js + SQLite/Drizzle + NextAuth + Claude | EXTEND — its player/progress/ranks/AI-marking generalised to all courses |
| Catalog: prompt design | PROMPT_DESIGN_COURSE | `../PROMPT_DESIGN_COURSE` | static HTML/CSS/JS + localStorage | ADOPT — import into the course player |
| Catalog: workflow design | ai-workflow-design-course | `../ai-workflow-design-course` | static HTML + localStorage | ADOPT |
| Catalog: knowledgebases | creating-knowledgebases-course | `../creating-knowledgebases-course` | static HTML + localStorage | ADOPT — also seeds the Ground enablement |
| Catalog: agent networks | openclaw-course | `../openclaw-course` | static HTML + localStorage | ADOPT — course topic only (openclaw not a platform dependency) |
| Workshop | ai-content-workshop | `../ai-content-workshop` | markdown prompts + .docx/.pptx | ADOPT — facilitated Specify→Build lab + downloadable assets |
| Authoring aids | scope-maker / prompt-improver | (as above) | — | SHARED with Agent Platform Specify |
| Per-stage enablement | **enablement layer** | — | — | NEW — how-it-works/guides/training mapped 1:1 to the 11 stages |

---

## Out of scope (separate products — do NOT build here)

| Product | Apps | Where it lives |
|---|---|---|
| Resonate | DRUMS, eight-track-sequencer, dub-siren, viz-synth, DowerTefence, space-shooter, racer, dower_tefence_art | `../superapp-blueprints/02-resonate.md` |
| Mission Control | daily-stock-trader, soccer-pundit, EARNING_TIMER, j-search | `../superapp-blueprints/03-mission-control.md` |
| Dropped/parked | theatre-scout (dropped), pod-to-mp3 (parked) | — |
| Optional output target only | openclaw-product-team, openclaw-dev-team, Virtual Product team config | not a seed; an optional deploy target |

> The shared spine (cost-tracker, feedback-tracker, lloyds-design, DEMO_LAUNCHER) is built once here; if Resonate/Mission Control are ever revived they can reuse it, but that is not part of this plan.

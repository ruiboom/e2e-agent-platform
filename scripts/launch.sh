#!/usr/bin/env bash
# One-command launcher for the full suite:
#   docker infra (Postgres+pgvector, Neo4j, cost, feedback) -> migrations
#   -> the 5 FastAPI services + the Next.js console (backgrounded) -> seed prompts.
# Idempotent: skips anything already listening. Logs to var/log/.
set -u
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
export PATH="$HOME/.npm-global/bin:$PATH"   # pnpm shim (harmless if already on PATH)
LOG="$ROOT/var/log"; mkdir -p "$LOG"
COMPOSE="docker compose -f infra/docker-compose.yml"

echo "▶ infra (Postgres, Neo4j, cost, feedback)…"
$COMPOSE up -d postgres neo4j cost-tracker feedback-tracker >/dev/null 2>&1

echo "▶ waiting for Postgres…"
for _ in $(seq 1 30); do
  docker exec agent-platform-postgres-1 pg_isready -U postgres -d agent_platform >/dev/null 2>&1 && break
  sleep 2
done

echo "▶ migrations…"
pnpm --filter @agent-platform/db migrate >"$LOG/migrate.log" 2>&1 || echo "  ! migrate issues — see $LOG/migrate.log"

svc() {  # name  app-dir  port
  if lsof -ti:"$3" >/dev/null 2>&1; then
    echo "   :$3 $1 (already running)"
  else
    nohup uv run uvicorn app.main:app --app-dir "$2" --port "$3" >"$LOG/$1.log" 2>&1 &
    echo "   :$3 $1 → var/log/$1.log"
  fi
}
echo "▶ services…"
svc model-router  services/model-router  8789
svc ground        services/ground        8790
svc build-runtime services/build-runtime 8791
svc eval          services/eval          8792
svc optimise      services/optimise      8793

echo "▶ console…"
if lsof -ti:3000 >/dev/null 2>&1; then
  echo "   :3000 console (already running)"
else
  nohup pnpm --filter @agent-platform/console dev >"$LOG/console.log" 2>&1 &
  echo "   :3000 console → var/log/console.log"
fi

echo "▶ waiting for health…"
for p in 8789 8790 8791 8792 8793; do
  for _ in $(seq 1 40); do curl -sf --max-time 2 "localhost:$p/healthz" >/dev/null 2>&1 && break; sleep 1; done
done
for _ in $(seq 1 60); do curl -sf --max-time 2 localhost:3000/login >/dev/null 2>&1 && break; sleep 1; done

echo "▶ seeding router prompts…"
for s in 1 2 4 5 7; do bash "scripts/seed-phase$s.sh" >/dev/null 2>&1; done
bash scripts/seed-h-graph.sh >/dev/null 2>&1

echo
echo "── status ──"
status() {  # port  label  [healthpath]
  if curl -sf --max-time 2 "localhost:$1/${3:-healthz}" >/dev/null 2>&1; then echo "  ✓ :$1 $2"; else echo "  ✗ :$1 $2"; fi
}
status 8787 cost-tracker     v1/meta
status 8788 feedback-tracker v1/meta
status 8789 model-router
status 8790 ground
status 8791 build-runtime
status 8792 eval
status 8793 optimise
if curl -sf --max-time 3 localhost:3000/login >/dev/null 2>&1; then echo "  ✓ :3000 console"; else echo "  ✗ :3000 console (still compiling? check var/log/console.log)"; fi
echo
echo "Open http://localhost:3000  (sign in as Alice / admin)"
echo "Verify: make verify-all   ·   Stop: make down"

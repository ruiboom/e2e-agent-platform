#!/usr/bin/env bash
# Stop the host services (console + the 5 FastAPI services).
# Docker infra (Postgres, Neo4j, cost, feedback) stays up — use `make infra-down`.
set -u
for p in 3000 8789 8790 8791 8792 8793; do
  pid=$(lsof -ti:"$p" 2>/dev/null)
  if [ -n "$pid" ]; then kill $pid 2>/dev/null; echo "stopped :$p ($pid)"; else echo ":$p not running"; fi
done
echo "host services stopped (docker infra still up — 'make infra-down' to stop containers too)"

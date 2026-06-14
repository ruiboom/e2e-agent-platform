#!/usr/bin/env bash
# Wipe ALL project/knowledge/audit data (keeps schema + the router prompt registry).
# Clears the Neo4j graph too. Use before seeding a clean example.
set -u
PSQL=(docker exec agent-platform-postgres-1 psql -U postgres -d agent_platform)

"${PSQL[@]}" -c "TRUNCATE
  artifact_parent, artifact, kb_chunk_entity, kb_chunk, kb_revision, kb_item,
  kb_release, agent_version, deployment, policy_bundle, chat_log,
  academy_progress, audit_event, project
  RESTART IDENTITY CASCADE;" >/dev/null && echo "✓ Postgres data cleared (prompts + schema kept)"

docker exec agent-platform-neo4j-1 cypher-shell -u neo4j -p password123 \
  "MATCH (n) DETACH DELETE n" >/dev/null 2>&1 && echo "✓ Neo4j graph cleared" || echo "· Neo4j clear skipped (container down?)"

echo "done."

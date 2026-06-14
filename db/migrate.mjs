#!/usr/bin/env node
// Minimal forward-only migration runner.
// Applies db/migrations/*.sql in lexical order, each in its own transaction,
// recording applied files in schema_migrations. Idempotent: re-running skips
// already-applied files.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load a sibling .env (repo root) if present, without a dependency.
function loadDotenv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadDotenv(join(__dirname, "..", ".env"));

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5433/agent_platform";

const migrationsDir = join(__dirname, "migrations");

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const files = existsSync(migrationsDir)
      ? readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()
      : [];

    const { rows } = await client.query("SELECT filename FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.filename));

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`· skip   ${file}`);
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`✓ apply  ${file}`);
        count++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`✗ failed ${file}\n${err.message}`);
        throw err;
      }
    }
    console.log(`\nMigrations complete — ${count} applied, ${files.length - count} skipped.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

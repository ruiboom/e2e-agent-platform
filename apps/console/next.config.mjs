import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship TS/TSX source — let Next transpile them.
  transpilePackages: [
    "@agent-platform/design-system",
    "@agent-platform/lineage-client",
    "@agent-platform/model-router-client",
    "@agent-platform/feedback-widget",
  ],
  // Pin the monorepo root (a stray ~/pnpm-lock.yaml otherwise confuses inference).
  outputFileTracingRoot: repoRoot,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;

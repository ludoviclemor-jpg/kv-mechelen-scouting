import type { NextConfig } from "next";

// Deployed as a GitHub Pages *project* site at:
// https://ludoviclemor-jpg.github.io/kv-mechelen-scouting/
// so every asset/link must be prefixed with the repo name. GitHub Actions
// sets GITHUB_ACTIONS=true automatically, so local `next dev` / `next build`
// still run at the domain root while the CI build gets the real base path.
const repoName = "kv-mechelen-scouting";
const isGithubActions = process.env.GITHUB_ACTIONS === "true";
const basePath = isGithubActions ? `/${repoName}` : "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  trailingSlash: true,
  // Next.js 16 auto-generates AGENTS.md/CLAUDE.md on dev/build by default —
  // not something we authored, don't want it appearing as repo clutter.
  agentRules: false,
  images: {
    // GitHub Pages has no image optimization server; serve assets as-is.
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;

#!/usr/bin/env node
// Builds a fixture into examples/<name> as its own git repo: a main commit from fixtures/<name>/main, then a
// branch that removes the paths in branch.json and overlays fixtures/<name>/branch. Run glance inside it.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node fixtures/build.mjs <name>");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, name);
const meta = JSON.parse(readFileSync(join(src, "branch.json"), "utf8"));
const out = join(here, "..", "examples", name);

// Fixed author and dates so rebuilding gives the same commits.
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.com", GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.com", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};
const git = (...args) => execFileSync("git", args, { cwd: out, env, stdio: "pipe" });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
git("init", "-q", "-b", "main");
cpSync(join(src, "main"), out, { recursive: true });
git("add", "-A");
git("commit", "-q", "-m", meta.base);

git("switch", "-q", "-c", meta.branch);
for (const path of meta.delete || []) rmSync(join(out, path));
cpSync(join(src, "branch"), out, { recursive: true });
git("add", "-A");
git("commit", "-q", "-m", meta.title);

console.log(`Built examples/${name} on ${meta.branch}. Review it with: cd examples/${name} && glance`);

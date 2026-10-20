import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface FileChange {
  status: string; // A, M, R, C, D, …
  path: string;
  oldPath: string;
  untracked?: boolean;
}

export interface Diff {
  added: { line: number; text: string }[];
  removed: { anchor: number; text: string }[]; // anchor: the line in the new file where the removal happened
}

export function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

export function tryGit(cwd: string, args: string[]): string | null {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

export function repoRoot(cwd: string): string {
  const out = tryGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (!out) throw new Error("Not inside a git repository.");
  return out.trim();
}

export function refExists(root: string, ref: string): boolean {
  return tryGit(root, ["rev-parse", "--verify", "--quiet", ref + "^{commit}"]) !== null;
}

export function defaultBase(root: string): string {
  const remoteHead = tryGit(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])?.trim();
  const candidates = [remoteHead, "main", "master", "origin/main", "origin/master"].filter((ref): ref is string => !!ref);
  const found = candidates.find((ref) => refExists(root, ref));
  if (!found) throw new Error("Couldn't find a base branch. Pass one with --base.");
  return found;
}

export function branchName(root: string, head: string): string {
  const name = tryGit(root, ["rev-parse", "--abbrev-ref", head]);
  return name ? name.trim() : head;
}

export function mergeBase(root: string, base: string, head: string): string {
  return git(root, ["merge-base", base, head]).trim();
}

export function listFiles(root: string, rev: string): string[] {
  return git(root, ["ls-tree", "-r", "-z", "--name-only", rev]).split("\0").filter(Boolean);
}

// -z output: status, then one path, or two (old, new) for renames and copies.
function parseNameStatus(out: string): FileChange[] {
  const parts = out.split("\0").filter((p) => p !== "");
  const changes: FileChange[] = [];
  for (let i = 0; i < parts.length; ) {
    const status = (parts[i++] ?? "")[0] ?? "";
    const first = parts[i++] ?? "";
    if (status === "R" || status === "C") changes.push({ status, oldPath: first, path: parts[i++] ?? first });
    else changes.push({ status, oldPath: first, path: first });
  }
  return changes;
}

export function changedFiles(root: string, from: string, to: string): FileChange[] {
  return parseNameStatus(git(root, ["diff", "--name-status", "-z", "-M", from, to]));
}

// The working tree: tracked files that still exist, plus untracked files that aren't ignored.
export function workingFiles(root: string): string[] {
  const paths = git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter(Boolean);
  return [...new Set(paths)].filter((p) => existsSync(join(root, p)));
}

// Changes from a commit to the working tree, staged or not. Untracked files count as added.
export function workingChanges(root: string, from: string): FileChange[] {
  const tracked = parseNameStatus(git(root, ["diff", "--name-status", "-z", "-M", from]));
  const untracked = git(root, ["ls-files", "-z", "--others", "--exclude-standard"]).split("\0").filter(Boolean);
  return tracked.concat(untracked.map((path) => ({ status: "A", oldPath: path, path, untracked: true })));
}

export function readWorking(root: string, path: string): string | null {
  const file = join(root, path);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

// Line numbers are in the new file. With no `to`, compares against the working tree.
export function fileDiff(root: string, from: string, to: string | null, oldPath: string, path: string): Diff {
  const out = git(root, ["diff", "-U0", "-M", from, ...(to ? [to] : []), "--", oldPath, path]);
  const diff: Diff = { added: [], removed: [] };
  let next = 0;
  for (const line of out.split("\n")) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunk) {
      next = Number(hunk[1]);
      // A pure deletion reports the line before it; attribute it to the line after.
      if (hunk[2] === "0") next += 1;
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) diff.added.push({ line: next++, text: line.slice(1) });
    else if (line.startsWith("-")) diff.removed.push({ anchor: Math.max(next, 1), text: line.slice(1) });
  }
  return diff;
}

export function show(root: string, rev: string, path: string): string | null {
  return tryGit(root, ["show", `${rev}:${path}`]);
}

export function firstSubject(root: string, from: string, to: string): string | null {
  const out = tryGit(root, ["log", "--reverse", "--format=%s", `${from}..${to}`]);
  return out?.split("\n").find(Boolean) ?? null;
}

export function gitDir(root: string): string {
  return git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim();
}

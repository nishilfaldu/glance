import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

export function tryGit(cwd, args) {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

export function repoRoot(cwd) {
  const out = tryGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (!out) throw new Error("Not inside a git repository.");
  return out.trim();
}

export function refExists(root, ref) {
  return tryGit(root, ["rev-parse", "--verify", "--quiet", ref + "^{commit}"]) !== null;
}

export function defaultBase(root) {
  const remoteHead = tryGit(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  const candidates = [remoteHead && remoteHead.trim(), "main", "master", "origin/main", "origin/master"].filter(Boolean);
  const found = candidates.find((ref) => refExists(root, ref));
  if (!found) throw new Error("Couldn't find a base branch. Pass one with --base.");
  return found;
}

export function branchName(root, head) {
  const name = tryGit(root, ["rev-parse", "--abbrev-ref", head]);
  return name ? name.trim() : head;
}

export function mergeBase(root, base, head) {
  return git(root, ["merge-base", base, head]).trim();
}

export function listFiles(root, rev) {
  return git(root, ["ls-tree", "-r", "-z", "--name-only", rev]).split("\0").filter(Boolean);
}

function parseNameStatus(out) {
  const parts = out.split("\0").filter((p) => p !== "");
  const changes = [];
  for (let i = 0; i < parts.length; ) {
    const status = parts[i++][0];
    if (status === "R" || status === "C") {
      const oldPath = parts[i++];
      changes.push({ status, oldPath, path: parts[i++] });
    } else {
      const path = parts[i++];
      changes.push({ status, oldPath: path, path });
    }
  }
  return changes;
}

// Returns [{ status: "A" | "M" | "D" | "R" | ..., path, oldPath }]
export function changedFiles(root, from, to) {
  return parseNameStatus(git(root, ["diff", "--name-status", "-z", "-M", from, to]));
}

// The working tree: tracked files that still exist, plus untracked files that aren't ignored.
export function workingFiles(root) {
  const paths = git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter(Boolean);
  return [...new Set(paths)].filter((p) => existsSync(join(root, p)));
}

// Changes from a commit to the working tree, staged or not. Untracked files count as added.
export function workingChanges(root, from) {
  const tracked = parseNameStatus(git(root, ["diff", "--name-status", "-z", "-M", from]));
  const untracked = git(root, ["ls-files", "-z", "--others", "--exclude-standard"]).split("\0").filter(Boolean);
  return tracked.concat(untracked.map((path) => ({ status: "A", oldPath: path, path, untracked: true })));
}

export function readWorking(root, path) {
  const file = join(root, path);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

// Returns { added: [{ line, text }], removed: [{ anchor, text }] } with line numbers in the new file.
// With no `to`, compares against the working tree.
export function fileDiff(root, from, to, oldPath, path) {
  const out = git(root, ["diff", "-U0", "-M", from, ...(to ? [to] : []), "--", oldPath, path]);
  const added = [], removed = [];
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
    if (line.startsWith("+")) added.push({ line: next++, text: line.slice(1) });
    else if (line.startsWith("-")) removed.push({ anchor: Math.max(next, 1), text: line.slice(1) });
  }
  return { added, removed };
}

export function show(root, rev, path) {
  return tryGit(root, ["show", `${rev}:${path}`]);
}

export function firstSubject(root, from, to) {
  const out = tryGit(root, ["log", "--reverse", "--format=%s", `${from}..${to}`]);
  return out ? out.split("\n").find(Boolean) || null : null;
}

export function gitDir(root) {
  return git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim();
}

// Builds a brief: the whole repo tree, the functions a branch touched, the calls between them, and rule-based flags.
import { basename } from "node:path";
import * as git from "./git.js";
import { CODE_FILE, packageName, readCode, resolveImport, unitAt } from "./code.js";
import { globToRegExp, parseGlanceYml } from "./config.js";

const LOCKFILE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|go\.sum|composer\.lock|Gemfile\.lock)$/;
const BUNDLED = /\.(min\.js|min\.css|map)$/;
const GENERATED_MARK = /DO NOT EDIT|@generated/;
const TEST_FILE = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const MAX_UNCHANGED_SHOWN = 12;

// Rules: each one names what it found. Nothing here is a judgment call.
const ENV_FALLBACK = /process\.env\.[A-Za-z0-9_]+\s*(\?\?|\|\|)\s*["'`]/;
const TYPE_ESCAPE = /\bas any\b|@ts-ignore|@ts-nocheck|eslint-disable/;
const ASSERTION = /\b(expect|assert)\s*[.(]/;

const FOLDER_COLORS = {
  src: "#4caf50", app: "#4caf50", lib: "#8d6e63", utils: "#8d6e63", helpers: "#8d6e63",
  test: "#26a69a", tests: "#26a69a", __tests__: "#26a69a", spec: "#26a69a",
  docs: "#42a5f5", api: "#7e57c2", web: "#29b6f6", components: "#ffa726", auth: "#ef6c00",
  config: "#78909c", scripts: "#9ccc65", generated: "#78909c", dist: "#78909c", build: "#78909c",
  public: "#ffca28", assets: "#ffca28", static: "#ffca28",
};
const PALETTE = ["#ef6c00", "#7e57c2", "#29b6f6", "#8d6e63", "#26a69a", "#ec407a", "#5c6bc0", "#9ccc65", "#ffa726"];

function folderColor(name) {
  const last = name.split("/").pop();
  if (FOLDER_COLORS[last]) return FOLDER_COLORS[last];
  let h = 0;
  for (const ch of last) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function fileIcon(path) {
  if (TEST_FILE.test(path) && CODE_FILE.test(path)) return "test";
  if (/\.(ts|tsx|mts|cts)$/.test(path)) return "ts";
  if (/\.(js|jsx|mjs|cjs)$/.test(path)) return "js";
  if (/\.json$/.test(path)) return "json";
  if (/\.mdx?$/.test(path)) return "md";
  if (/\.ya?ml$/.test(path)) return "yaml";
  return "file";
}

function shouldSkip(path, text, patterns) {
  if (LOCKFILE.test(path) || BUNDLED.test(path)) return true;
  if (patterns.some((re) => re.test(path))) return true;
  return text !== null && GENERATED_MARK.test(text.split("\n", 5).join("\n"));
}

function depChanges(baseText, headText) {
  const parse = (t) => { try { return t ? JSON.parse(t) : {}; } catch { return {}; } };
  const before = parse(baseText), after = parse(headText), out = [];
  for (const field of DEP_FIELDS) {
    for (const [name, version] of Object.entries(after[field] || {})) {
      const old = before[field] && before[field][name];
      if (old === undefined) out.push({ name, state: "new" });
      else if (old !== version) out.push({ name, state: "changed" });
    }
  }
  return out;
}

export function analyze({ cwd, base, head = "HEAD", title, working = false }) {
  const root = git.repoRoot(cwd);
  const baseRef = base || git.defaultBase(root);
  const from = git.mergeBase(root, baseRef, working ? "HEAD" : head);
  // What is being reviewed: a commit, or the working tree with its uncommitted changes.
  const read = (path) => (working ? git.readWorking(root, path) : git.show(root, head, path));
  const headFiles = working ? git.workingFiles(root) : git.listFiles(root, head);
  const fileSet = new Set(headFiles);
  const skipPatterns = parseGlanceYml(read(".glance.yml")).skip.map(globToRegExp);

  const changes = new Map(); // path -> { status, oldPath, untracked?, state, records, flags }
  for (const c of working ? git.workingChanges(root, from) : git.changedFiles(root, from, head)) {
    if (c.status === "D") continue; // deleted files are not in the tree at head
    changes.set(c.path, { ...c, state: c.status === "A" ? "new" : "changed", records: [], flags: [] });
  }

  // 1. Which functions each file touched, plus flags from the rules.
  const records = new Map(); // id -> { id, path, name, kind, state, unit, calls, flags }
  const code = new Map();    // path -> readCode() result
  for (const [path, change] of changes) {
    const text = read(path);
    if (shouldSkip(path, text, skipPatterns)) { change.state = "skip"; continue; }
    // git has no diff for untracked files: every line is new.
    const diff = change.untracked
      ? { added: (text || "").split("\n").map((t, i) => ({ line: i + 1, text: t })), removed: [] }
      : git.fileDiff(root, from, working ? null : head, change.oldPath, path);
    const baseText = change.status === "A" ? null : git.show(root, from, change.oldPath);
    const isTest = TEST_FILE.test(path);

    const addRecord = (name, kind, state, unit) => {
      let id = `${path}#${name}`;
      for (let n = 2; records.has(id); n++) id = `${path}#${name} (${n})`;
      const rec = { id, path, name: id.slice(path.length + 1), kind, state, unit, calls: new Set(), flags: [] };
      records.set(id, rec);
      change.records.push(rec);
      return rec;
    };

    if (basename(path) === "package.json") {
      for (const dep of depChanges(baseText, text)) addRecord(dep.name, "dep", dep.state, null);
      continue;
    }
    if (!CODE_FILE.test(path) || text === null) continue;

    const parsed = readCode(path, text);
    code.set(path, parsed);
    const baseNames = new Set(baseText && CODE_FILE.test(change.oldPath) ? readCode(change.oldPath, baseText).units.map((u) => u.name) : []);
    const touched = new Set();
    for (const a of diff.added) touched.add(unitAt(parsed.units, a.line));
    for (const r of diff.removed) touched.add(unitAt(parsed.units, r.anchor));
    const recordOf = new Map();
    for (const u of parsed.units) {
      if (touched.has(u)) recordOf.set(u, addRecord(u.name, u.kind, baseNames.has(u.name) ? "changed" : "new", u));
    }

    const flagAt = (line, reason) => {
      const rec = recordOf.get(unitAt(parsed.units, line));
      const list = rec ? rec.flags : change.flags;
      if (!list.includes(reason)) list.push(reason);
    };
    const addedLines = new Set(diff.added.map((a) => a.line));
    for (const line of parsed.swallowed) if (addedLines.has(line)) flagAt(line, "error swallowed");
    for (const a of diff.added) {
      if (ENV_FALLBACK.test(a.text)) flagAt(a.line, "env var with a hard-coded fallback");
      if (TYPE_ESCAPE.test(a.text)) flagAt(a.line, "type or lint check bypassed");
    }
    if (isTest) {
      const readded = new Set(diff.added.map((a) => a.text.trim()));
      for (const r of diff.removed) {
        if (ASSERTION.test(r.text) && !readded.has(r.text.trim())) flagAt(r.anchor, "assertion removed");
      }
    }
  }

  // 2. Calls between touched functions, resolved through local names and imports.
  const depRecords = [...records.values()].filter((r) => r.kind === "dep");
  const recordByUnit = new Map([...records.values()].filter((r) => r.unit).map((r) => [r.unit, r]));
  const nodeId = (path, unit) => recordByUnit.get(unit)?.id || `${path}#${unit.name}@${unit.start}`;
  const findLocal = (path, local, isDefault) => {
    const unit = code.get(path)?.units.find((u) => (isDefault ? u.isDefault : u.local === local));
    return unit ? nodeId(path, unit) : null;
  };
  const resolve = (path, imports, call) => {
    // "ns.fn" only resolves when ns is an `import * as ns`; other property calls stay unresolved.
    const [name, member] = call.split(".");
    const imp = imports.get(name);
    if (member && imp?.imported !== "*") return null;
    if (!imp) return findLocal(path, name, false);
    const pkg = packageName(imp.source);
    if (pkg) {
      const dep = depRecords
        .filter((d) => d.name === pkg && path.startsWith(d.path.replace(/package\.json$/, "")))
        .sort((a, b) => b.path.length - a.path.length)[0];
      return dep ? dep.id : null;
    }
    const file = resolveImport(path, imp.source, fileSet);
    const exported = member || imp.imported;
    return file ? findLocal(file, exported, exported === "default") : null;
  };

  for (const [path, parsed] of code) {
    for (const unit of parsed.units) {
      const caller = nodeId(path, unit);
      for (const call of unit.calls) {
        const callee = resolve(path, parsed.imports, call);
        if (!callee || callee === caller) continue;
        if (records.has(caller) && records.has(callee)) records.get(caller).calls.add(callee);
      }
    }
  }

  // 3. The tree the viewer draws: every folder and its files, unchanged ones included.
  const tree = { name: basename(root), dirs: new Map(), files: [] };
  for (const path of headFiles) {
    const parts = path.split("/");
    let node = tree;
    for (const part of parts.slice(0, -1)) {
      if (!node.dirs.has(part)) node.dirs.set(part, { name: part, dirs: new Map(), files: [] });
      node = node.dirs.get(part);
    }
    node.files.push(path);
  }

  let spot = 0;
  const fileEntry = (path) => {
    const change = changes.get(path);
    const entry = { name: basename(path), icon: fileIcon(path), state: change ? change.state : "same" };
    if (!change || change.state === "skip") return entry;
    if (change.flags.length) { entry.spot = ++spot; entry.flags = change.flags; }
    entry.fns = change.records.map((r) => {
      const fn = { name: r.name, kind: r.kind, state: r.state };
      if (r.calls.size) fn.calls = [...r.calls];
      if (r.flags.length) { fn.spot = ++spot; fn.flags = r.flags; }
      return fn;
    });
    return entry;
  };

  function build(node) {
    let name = node.name;
    // Fold folders that only hold one folder: src/components/ui
    while (node.files.length === 0 && node.dirs.size === 1) {
      node = [...node.dirs.values()][0];
      name += `/${node.name}`;
    }
    const out = { name, color: folderColor(name) };
    const changedFiles = node.files.filter((p) => changes.has(p));
    const unchanged = node.files.filter((p) => !changes.has(p));
    const shown = new Set([...changedFiles, ...unchanged.slice(0, MAX_UNCHANGED_SHOWN)]);
    out.files = node.files.filter((p) => shown.has(p)).map(fileEntry);
    if (unchanged.length > MAX_UNCHANGED_SHOWN) out.more = unchanged.length - MAX_UNCHANGED_SHOWN;
    out.dirs = [...node.dirs.values()].map(build);
    return out;
  }

  // Folders first, then root files, matching the order the viewer draws them in, so spot numbers read top to bottom.
  const rootDirs = [...tree.dirs.values()].map(build);
  const rootOut = { name: tree.name, files: tree.files.map(fileEntry), dirs: rootDirs };
  const headName = git.branchName(root, working ? "HEAD" : head);
  const fnCount = [...changes.values()].reduce((n, c) => n + c.records.length, 0);
  return {
    brief: {
      version: 1,
      repo: tree.name,
      title: title || git.firstSubject(root, from, working ? "HEAD" : head) || headName,
      head: working ? `${headName} + uncommitted` : headName,
      base: baseRef,
      root: rootOut,
    },
    stats: { files: changes.size, functions: fnCount, flags: spot },
    root,
  };
}

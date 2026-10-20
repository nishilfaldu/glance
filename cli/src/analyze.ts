// Builds a brief: the whole repo tree, the functions a branch touched, the calls between them, and the flags
// from the repo's own rules in .glance.yml.
import { basename } from "node:path";
import type { Brief, BriefDir, BriefFile, FileIcon, UnitKind } from "./brief.js";
import { CODE_FILE, type Import, type ParsedCode, packageName, readCode, resolveImport, type Unit, unitAt } from "./code.js";
import { type FlagRule, readGlanceYml } from "./config.js";
import * as git from "./git.js";

const TEST_FILE = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
const MAX_UNCHANGED_SHOWN = 12;

const FOLDER_COLORS: Record<string, string> = {
  src: "#4caf50", app: "#4caf50", lib: "#8d6e63", utils: "#8d6e63", helpers: "#8d6e63",
  test: "#26a69a", tests: "#26a69a", __tests__: "#26a69a", spec: "#26a69a",
  docs: "#42a5f5", api: "#7e57c2", web: "#29b6f6", components: "#ffa726", auth: "#ef6c00",
  config: "#78909c", scripts: "#9ccc65", generated: "#78909c", dist: "#78909c", build: "#78909c",
  public: "#ffca28", assets: "#ffca28", static: "#ffca28",
};
const PALETTE = ["#ef6c00", "#7e57c2", "#29b6f6", "#8d6e63", "#26a69a", "#ec407a", "#5c6bc0", "#9ccc65", "#ffa726"];

// A touched function, route, test case or dependency.
interface Rec {
  id: string; // "path#name"
  path: string;
  name: string;
  kind: UnitKind;
  state: "new" | "changed";
  unit: Unit | null; // null for dependencies
  calls: Set<string>;
  flags: string[];
}

interface Change extends git.FileChange {
  state: "new" | "changed" | "skip";
  records: Rec[];
  flags: string[]; // flags on lines outside any function
}

interface TreeNode {
  name: string;
  dirs: Map<string, TreeNode>;
  files: string[];
}

export interface Analysis {
  brief: Brief;
  stats: { files: number; functions: number; flags: number };
  root: string; // the repo's top-level folder
}

function folderColor(name: string): string {
  const last = name.split("/").pop() ?? name;
  const known = FOLDER_COLORS[last];
  if (known) return known;
  let h = 0;
  for (const ch of last) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length] ?? "#78909c";
}

function fileIcon(path: string): FileIcon {
  if (TEST_FILE.test(path) && CODE_FILE.test(path)) return "test";
  if (/\.(ts|tsx|mts|cts)$/.test(path)) return "ts";
  if (/\.(js|jsx|mjs|cjs)$/.test(path)) return "js";
  if (/\.json$/.test(path)) return "json";
  if (/\.mdx?$/.test(path)) return "md";
  if (/\.ya?ml$/.test(path)) return "yaml";
  return "file";
}

// Puts each matching rule's name on the function around the matching line, or on the file when there is none.
function applyFlags(rules: FlagRule[], path: string, diff: git.Diff, change: Change, recordAt: (line: number) => Rec | undefined): void {
  const flag = (list: string[], name: string) => { if (!list.includes(name)) list.push(name); };
  const readded = new Set(diff.added.map((a) => a.text.trim()));
  for (const rule of rules) {
    if (rule.path && !rule.path.test(path)) continue;
    if (!rule.added && !rule.removed) { flag(change.flags, rule.name); continue; }
    for (const a of diff.added) {
      if (rule.added?.test(a.text)) flag(recordAt(a.line)?.flags ?? change.flags, rule.name);
    }
    for (const r of diff.removed) {
      if (rule.removed?.test(r.text) && !readded.has(r.text.trim())) flag(recordAt(r.anchor)?.flags ?? change.flags, rule.name);
    }
  }
}

type Manifest = Partial<Record<(typeof DEP_FIELDS)[number], Record<string, string>>>;

function depChanges(baseText: string | null, headText: string | null): { name: string; state: "new" | "changed" }[] {
  const parse = (t: string | null): Manifest => { try { return t ? JSON.parse(t) : {}; } catch { return {}; } };
  const before = parse(baseText), after = parse(headText);
  const out: { name: string; state: "new" | "changed" }[] = [];
  for (const field of DEP_FIELDS) {
    for (const [name, version] of Object.entries(after[field] ?? {})) {
      const old = before[field]?.[name];
      if (old === undefined) out.push({ name, state: "new" });
      else if (old !== version) out.push({ name, state: "changed" });
    }
  }
  return out;
}

export function analyze({ cwd, base, head = "HEAD", title, working = false }:
  { cwd: string; base?: string; head?: string; title?: string; working?: boolean }): Analysis {
  const root = git.repoRoot(cwd);
  const baseRef = base || git.defaultBase(root);
  const reviewed = working ? "HEAD" : head;
  const from = git.mergeBase(root, baseRef, reviewed);
  // What is being reviewed: a commit, or the working tree with its uncommitted changes.
  const read = (path: string) => (working ? git.readWorking(root, path) : git.show(root, head, path));
  const headFiles = working ? git.workingFiles(root) : git.listFiles(root, head);
  const fileSet = new Set(headFiles);
  const config = readGlanceYml(read(".glance.yml"));

  const changes = new Map<string, Change>();
  for (const c of working ? git.workingChanges(root, from) : git.changedFiles(root, from, head)) {
    if (c.status === "D") continue; // deleted files are not in the tree at head
    changes.set(c.path, { ...c, state: c.status === "A" ? "new" : "changed", records: [], flags: [] });
  }

  // 1. Which functions each file touched, plus the flag rules from .glance.yml.
  const records = new Map<string, Rec>();
  const code = new Map<string, ParsedCode>();
  for (const [path, change] of changes) {
    if (config.skip.some((re) => re.test(path))) { change.state = "skip"; continue; }
    const text = read(path);
    // git has no diff for untracked files: every line is new.
    const diff: git.Diff = change.untracked
      ? { added: (text ?? "").split("\n").map((t, i) => ({ line: i + 1, text: t })), removed: [] }
      : git.fileDiff(root, from, working ? null : head, change.oldPath, path);
    const baseText = change.status === "A" ? null : git.show(root, from, change.oldPath);

    const addRecord = (name: string, kind: UnitKind, state: Rec["state"], unit: Unit | null): Rec => {
      let id = `${path}#${name}`;
      for (let n = 2; records.has(id); n++) id = `${path}#${name} (${n})`;
      const rec: Rec = { id, path, name: id.slice(path.length + 1), kind, state, unit, calls: new Set(), flags: [] };
      records.set(id, rec);
      change.records.push(rec);
      return rec;
    };

    // The touched function a line belongs to; only code files have them.
    let recordAt = (_line: number): Rec | undefined => undefined;
    if (basename(path) === "package.json") {
      for (const dep of depChanges(baseText, text)) addRecord(dep.name, "dep", dep.state, null);
    } else if (CODE_FILE.test(path) && text !== null) {
      const parsed = readCode(path, text);
      code.set(path, parsed);
      const baseNames = new Set(baseText && CODE_FILE.test(change.oldPath) ? readCode(change.oldPath, baseText).units.map((u) => u.name) : []);
      const touched = new Set<Unit | null>();
      for (const a of diff.added) touched.add(unitAt(parsed.units, a.line));
      for (const r of diff.removed) touched.add(unitAt(parsed.units, r.anchor));
      const recordOf = new Map<Unit, Rec>();
      for (const u of parsed.units) {
        if (touched.has(u)) recordOf.set(u, addRecord(u.name, u.kind, baseNames.has(u.name) ? "changed" : "new", u));
      }
      recordAt = (line) => {
        const unit = unitAt(parsed.units, line);
        return unit ? recordOf.get(unit) : undefined;
      };
    }
    applyFlags(config.flags, path, diff, change, recordAt);
  }

  // 2. Calls between touched functions, resolved through local names and imports.
  const depRecords = [...records.values()].filter((r) => r.kind === "dep");
  const recordByUnit = new Map<Unit, Rec>();
  for (const r of records.values()) if (r.unit) recordByUnit.set(r.unit, r);
  const findLocal = (path: string, local: string, isDefault: boolean): string | null => {
    const unit = code.get(path)?.units.find((u) => (isDefault ? u.isDefault : u.local === local));
    return unit ? (recordByUnit.get(unit)?.id ?? null) : null;
  };
  const resolve = (path: string, imports: Map<string, Import>, call: string): string | null => {
    // "ns.fn" only resolves when ns is an `import * as ns`; other property calls stay unresolved.
    const [name = "", member] = call.split(".");
    const imp = imports.get(name);
    if (member && imp?.imported !== "*") return null;
    if (!imp) return findLocal(path, name, false);
    const pkg = packageName(imp.source);
    if (pkg) {
      const dep = depRecords
        .filter((d) => d.name === pkg && path.startsWith(d.path.replace(/package\.json$/, "")))
        .sort((a, b) => b.path.length - a.path.length)[0];
      return dep?.id ?? null;
    }
    const file = resolveImport(path, imp.source, fileSet);
    const exported = member ?? imp.imported;
    return file ? findLocal(file, exported, exported === "default") : null;
  };

  for (const [path, parsed] of code) {
    for (const unit of parsed.units) {
      const caller = recordByUnit.get(unit);
      if (!caller) continue;
      for (const call of unit.calls) {
        const callee = resolve(path, parsed.imports, call);
        if (callee && callee !== caller.id) caller.calls.add(callee);
      }
    }
  }

  // 3. The tree the viewer draws: every folder and its files, unchanged ones included.
  const tree: TreeNode = { name: basename(root), dirs: new Map(), files: [] };
  for (const path of headFiles) {
    let node = tree;
    for (const part of path.split("/").slice(0, -1)) {
      let next = node.dirs.get(part);
      if (!next) {
        next = { name: part, dirs: new Map(), files: [] };
        node.dirs.set(part, next);
      }
      node = next;
    }
    node.files.push(path);
  }

  let flagged = 0;
  const fileEntry = (path: string): BriefFile => {
    const change = changes.get(path);
    const entry: BriefFile = { name: basename(path), icon: fileIcon(path), state: change ? change.state : "same" };
    if (!change || change.state === "skip") return entry;
    if (change.flags.length) { flagged++; entry.flags = change.flags; }
    entry.fns = change.records.map((r) => {
      const fn: NonNullable<BriefFile["fns"]>[number] = { name: r.name, kind: r.kind, state: r.state };
      if (r.calls.size) fn.calls = [...r.calls];
      if (r.flags.length) { flagged++; fn.flags = r.flags; }
      return fn;
    });
    return entry;
  };

  function build(start: TreeNode): BriefDir {
    let node = start, name = start.name;
    // Fold folders that only hold one folder: src/components/ui
    for (;;) {
      const [only, ...others] = node.dirs.values();
      if (node.files.length || !only || others.length) break;
      node = only;
      name += `/${only.name}`;
    }
    const unchanged = node.files.filter((p) => !changes.has(p));
    const shown = new Set([...node.files.filter((p) => changes.has(p)), ...unchanged.slice(0, MAX_UNCHANGED_SHOWN)]);
    const out: BriefDir = {
      name,
      color: folderColor(name),
      files: node.files.filter((p) => shown.has(p)).map(fileEntry),
      dirs: [...node.dirs.values()].map(build),
    };
    if (unchanged.length > MAX_UNCHANGED_SHOWN) out.more = unchanged.length - MAX_UNCHANGED_SHOWN;
    return out;
  }

  // Folders first, then root files, the order the viewer draws them in.
  const rootDirs = [...tree.dirs.values()].map(build);
  const rootOut = { name: tree.name, files: tree.files.map(fileEntry), dirs: rootDirs };
  const headName = git.branchName(root, reviewed);
  const fnCount = [...changes.values()].reduce((n, c) => n + c.records.length, 0);
  return {
    brief: {
      version: 1,
      repo: tree.name,
      title: title || git.firstSubject(root, from, reviewed) || headName,
      head: working ? `${headName} + uncommitted` : headName,
      base: baseRef,
      root: rootOut,
    },
    stats: { files: changes.size, functions: fnCount, flags: flagged },
    root,
  };
}

// Finds the file an import points to, and the function a file exports under a name. An import can be a relative
// path, a tsconfig "paths" alias, or a package that lives in this repo (a workspace); anything else is an outside
// package. Exports are followed through re-exports, parsing files that didn't change only when an import passes through.
import { posix } from "node:path";
import ts from "typescript";
import { CODE_FILE, type ClassInfo, type ParsedCode, packageName, readCode, type Unit } from "./code.js";

const EXTENSIONS = ["ts", "tsx", "mts", "js", "jsx", "mjs", "cjs"];

interface Aliases {
  patterns: [string, string[]][]; // "@/*" -> ["src/*"]
  base: string; // the folder targets are relative to
}

interface Workspace {
  dir: string;
  manifest: Manifest;
}

interface Manifest {
  name?: unknown;
  exports?: unknown;
  module?: unknown;
  main?: unknown;
  types?: unknown;
}

type Read = (path: string) => string | null;

// A repo-relative path, or null if it climbs out of the repo.
function clean(path: string): string | null {
  const out = posix.normalize(path);
  if (out === ".." || out.startsWith("../") || out.startsWith("/")) return null;
  return out === "." ? "" : out.replace(/^\.\//, "").replace(/\/$/, "");
}

function parseJson(path: string, text: string | null): Record<string, unknown> | null {
  if (text === null) return null;
  const { config } = ts.parseConfigFileTextToJson(path, text); // tolerates comments and trailing commas
  return typeof config === "object" && config !== null ? config : null;
}

// The first plain path in a package.json "exports" value: a string, or a condition map like { types, import, default }.
function firstPath(value: unknown, depth = 0): string | null {
  if (typeof value === "string") return value;
  if (depth > 2 || typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["types", "import", "default", "require"]) {
    const found = firstPath(record[key], depth + 1);
    if (found) return found;
  }
  return null;
}

export class Modules {
  private readonly parsedFiles = new Map<string, ParsedCode | null>();
  private readonly aliasCache = new Map<string, Aliases | null>();
  private workspaces: Map<string, Workspace> | null = null;

  constructor(
    private readonly files: Set<string>,
    private readonly read: Read,
    changed: Map<string, ParsedCode>,
  ) {
    for (const [path, parsed] of changed) this.parsedFiles.set(path, parsed);
  }

  // The file in the repo an import points to, or null for an outside package.
  resolve(fromPath: string, source: string): string | null {
    const dir = posix.dirname(fromPath);
    if (source.startsWith(".")) {
      const target = clean(posix.join(dir, source));
      return target === null ? null : this.fileFor(target);
    }
    return this.alias(dir, source) ?? this.workspace(source);
  }

  // The function `file` exports as `name` ("default" for the default export), following re-exports.
  exported(file: string, name: string): Unit | null {
    return this.lookup(file, name, (parsed, n) => parsed.units.find((u) => (n === "default" ? u.isDefault : u.local === n)));
  }

  // The class `file` exports as `name`, following re-exports.
  exportedClass(file: string, name: string): ClassInfo | null {
    return this.lookup(file, name, (parsed, n) => (n === "default" ? [...parsed.classes.values()].find((c) => c.isDefault) : parsed.classes.get(n)));
  }

  private lookup<T>(file: string, name: string, own: (parsed: ParsedCode, name: string) => T | undefined, seen = new Set<string>()): T | null {
    if (seen.has(file)) return null;
    seen.add(file);
    const parsed = this.parsed(file);
    if (!parsed) return null;
    const found = own(parsed, name);
    if (found) return found;
    for (const re of parsed.reexports) {
      const inner = re.names === "*" ? (name === "default" ? undefined : name) : re.names.get(name);
      const next = inner && this.resolve(file, re.source);
      const deeper = inner && next ? this.lookup(next, inner, own, seen) : null;
      if (deeper) return deeper;
    }
    return null;
  }

  private parsed(path: string): ParsedCode | null {
    if (!this.parsedFiles.has(path)) {
      const text = CODE_FILE.test(path) ? this.read(path) : null;
      this.parsedFiles.set(path, text === null ? null : readCode(path, text));
    }
    return this.parsedFiles.get(path) ?? null;
  }

  // An import path without its extension: "src/lib/format" -> src/lib/format.ts, or src/lib/format/index.ts, …
  private fileFor(base: string): string | null {
    const stem = base.replace(/\.(js|jsx|mjs|cjs)$/, "");
    const candidates = [base];
    for (const ext of EXTENSIONS) candidates.push(`${stem}.${ext}`, `${base ? `${base}/` : ""}index.${ext}`);
    return candidates.find((c) => this.files.has(c)) ?? null;
  }

  // tsconfig "paths" (and a bare "baseUrl") from the tsconfig.json or jsconfig.json nearest to the importing file.
  private alias(dir: string, source: string): string | null {
    const aliases = this.aliasesFor(dir);
    if (!aliases) return null;
    for (const [pattern, targets] of aliases.patterns) {
      const star = pattern.indexOf("*");
      const prefix = star < 0 ? pattern : pattern.slice(0, star);
      const suffix = star < 0 ? "" : pattern.slice(star + 1);
      const matches = star < 0 ? source === pattern : source.startsWith(prefix) && source.endsWith(suffix) && source.length >= prefix.length + suffix.length;
      if (!matches) continue;
      const captured = star < 0 ? "" : source.slice(prefix.length, source.length - suffix.length);
      for (const target of targets) {
        const path = clean(posix.join(aliases.base, target.replace("*", captured)));
        const file = path === null ? null : this.fileFor(path);
        if (file) return file;
      }
    }
    return null;
  }

  private aliasesFor(dir: string): Aliases | null {
    const cached = this.aliasCache.get(dir);
    if (cached !== undefined) return cached;
    let found: Aliases | null = null;
    const config = ["tsconfig.json", "jsconfig.json"].map((name) => (dir ? `${dir}/${name}` : name)).find((p) => this.files.has(p));
    if (config) found = this.loadAliases(config, new Set());
    else if (dir) found = this.aliasesFor(posix.dirname(dir) === "." ? "" : posix.dirname(dir));
    this.aliasCache.set(dir, found);
    return found;
  }

  // paths and baseUrl from a tsconfig and the configs it extends; paths resolve against baseUrl, or else the
  // folder of the config that set them.
  private loadAliases(config: string, seen: Set<string>): Aliases | null {
    if (seen.has(config)) return null;
    seen.add(config);
    const json = parseJson(config, this.read(config));
    if (!json) return null;
    const dir = posix.dirname(config) === "." ? "" : posix.dirname(config);
    let inherited: Aliases | null = null;
    for (const parent of [json.extends].flat()) {
      if (typeof parent !== "string" || !parent.startsWith(".")) continue; // shared configs from packages carry no repo paths
      const path = clean(posix.join(dir, parent.endsWith(".json") ? parent : `${parent}.json`));
      if (path !== null) inherited = this.loadAliases(path, seen) ?? inherited;
    }
    const options = (json.compilerOptions ?? {}) as Record<string, unknown>;
    const baseUrl = typeof options.baseUrl === "string" ? clean(posix.join(dir, options.baseUrl)) : null;
    const paths = typeof options.paths === "object" && options.paths !== null ? options.paths as Record<string, unknown> : null;
    if (!paths && baseUrl === null) return inherited;
    const patterns: [string, string[]][] = paths
      ? Object.entries(paths).map(([key, value]) => [key, Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []])
      : (inherited?.patterns ?? []);
    if (baseUrl !== null) patterns.push(["*", ["*"]]); // a baseUrl alone makes "lib/format" resolve from it
    return { patterns, base: baseUrl ?? (paths ? dir : (inherited?.base ?? dir)) };
  }

  // A package that lives in this repo: its entry file, or a file under it for "pkg/sub/path".
  private workspace(source: string): string | null {
    const name = packageName(source);
    const pkg = name ? this.workspaceMap().get(name) : undefined;
    if (!name || !pkg) return null;
    const sub = source.slice(name.length + 1);
    const exportsField = pkg.manifest.exports;
    const subExport = sub && typeof exportsField === "object" && exportsField !== null
      ? firstPath((exportsField as Record<string, unknown>)[`./${sub}`])
      : null;
    const entries = sub
      ? [subExport, sub, `src/${sub}`]
      : [firstPath(exportsField), pkg.manifest.module, pkg.manifest.main, pkg.manifest.types, "src/index", "index"];
    for (const entry of entries) {
      if (typeof entry !== "string") continue;
      // Built output isn't in the repo: look for "dist/index.js" as src/index.ts too.
      for (const path of [entry, entry.replace(/^(\.\/)?(dist|build|lib)\//, "src/")]) {
        const target = clean(posix.join(pkg.dir, path));
        const file = target === null ? null : this.fileFor(target);
        if (file) return file;
      }
    }
    return null;
  }

  private workspaceMap(): Map<string, Workspace> {
    if (this.workspaces) return this.workspaces;
    this.workspaces = new Map();
    for (const path of this.files) {
      if (path !== "package.json" && !path.endsWith("/package.json")) continue;
      const manifest = parseJson(path, this.read(path)) as Manifest | null;
      const dir = posix.dirname(path) === "." ? "" : posix.dirname(path);
      if (manifest && typeof manifest.name === "string") this.workspaces.set(manifest.name, { dir, manifest });
    }
    return this.workspaces;
  }
}

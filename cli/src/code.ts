// Reads TS/JS source with the TypeScript compiler: the functions in a file and what they call.
import ts from "typescript";

export const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const HTTP_ROUTE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//;
const TEST_CALLS = new Set(["it", "test"]);

// A unit is something a reviewer reads as one piece: a function, a method, a route handler or a test case.
export interface Unit {
  name: string;
  kind: "fn" | "route" | "case";
  local?: string; // the name other code calls it by, for declarations and named arrow functions
  isDefault?: boolean;
  start: number;
  end: number;
  calls: Set<string>; // "name" or "ns.name", resolved later against the imports
}

export interface Import {
  source: string;
  imported: string; // the exported name, "default", or "*" for a namespace import
}

export interface ParsedCode {
  units: Unit[];
  imports: Map<string, Import>; // by local name
}

type UnitHead = Omit<Unit, "start" | "end" | "calls">;

function scriptKind(path: string): ts.ScriptKind {
  if (/\.tsx$/.test(path)) return ts.ScriptKind.TSX;
  if (/\.jsx$/.test(path)) return ts.ScriptKind.JSX;
  if (/\.(js|mjs|cjs)$/.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function isFunctionLike(node: ts.Node | undefined): boolean {
  return !!node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function stringValue(node: ts.Node | undefined): string | null {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}

function unitFor(node: ts.Node): UnitHead | null {
  if (ts.isFunctionDeclaration(node) && node.name) {
    const isDefault = (node.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    return { name: `${node.name.text}()`, kind: "fn", local: node.name.text, isDefault };
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isFunctionLike(node.initializer)) {
    return { name: `${node.name.text}()`, kind: "fn", local: node.name.text };
  }
  if (ts.isMethodDeclaration(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
    const owner = ts.isClassLike(node.parent) && node.parent.name ? `${node.parent.name.text}.` : "";
    return { name: `${owner}${node.name.text}()`, kind: "fn" };
  }
  if (ts.isPropertyAssignment(node) && isFunctionLike(node.initializer)) {
    const key = stringValue(node.name);
    if (key && HTTP_ROUTE.test(key)) return { name: key, kind: "route" };
  }
  if (ts.isCallExpression(node)) {
    let callee = node.expression;
    if (ts.isPropertyAccessExpression(callee)) callee = callee.expression; // it.only, test.skip
    const title = stringValue(node.arguments[0]);
    if (ts.isIdentifier(callee) && TEST_CALLS.has(callee.text) && title && node.arguments.some(isFunctionLike)) {
      return { name: title, kind: "case" };
    }
  }
  return null;
}

// "name", or "ns.name" for `ns.name` (only resolved through `import * as ns`).
function targetName(expr: ts.Node): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) return `${expr.expression.text}.${expr.name.text}`;
  return null;
}

// What a node calls: the callee of a call, `new` or JSX element, plus functions handed over by name as an
// argument (`list.map(build)`) or a JSX prop (`onClick={save}`). Names that aren't functions resolve to nothing.
function callsIn(node: ts.Node): string[] {
  const targets: ts.Node[] = [];
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) targets.push(node.expression, ...(node.arguments ?? []));
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    targets.push(node.tagName);
    for (const attr of node.attributes.properties) {
      if (ts.isJsxAttribute(attr) && attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
        targets.push(attr.initializer.expression);
      }
    }
  }
  return targets.map(targetName).filter((name): name is string => name !== null);
}

function readImport(node: ts.ImportDeclaration, imports: Map<string, Import>): void {
  if (!ts.isStringLiteral(node.moduleSpecifier)) return;
  const source = node.moduleSpecifier.text;
  const clause = node.importClause;
  if (clause?.name) imports.set(clause.name.text, { source, imported: "default" });
  const bindings = clause?.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) {
    for (const el of bindings.elements) imports.set(el.name.text, { source, imported: (el.propertyName ?? el.name).text });
  }
  if (bindings && ts.isNamespaceImport(bindings)) imports.set(bindings.name.text, { source, imported: "*" });
}

export function readCode(path: string, text: string): ParsedCode {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(path));
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const parsed: ParsedCode = { units: [], imports: new Map() };

  function visit(node: ts.Node, owner: Unit | null): void {
    const head = unitFor(node);
    if (head) {
      owner = { ...head, start: lineOf(node.getStart(sf)), end: lineOf(node.getEnd()), calls: new Set() };
      parsed.units.push(owner);
    }
    if (ts.isImportDeclaration(node)) readImport(node, parsed.imports);
    if (owner) for (const name of callsIn(node)) owner.calls.add(name);
    ts.forEachChild(node, (child) => visit(child, owner));
  }
  visit(sf, null);
  return parsed;
}

// The innermost unit that contains a line, or null for module-level code.
export function unitAt(units: Unit[], line: number): Unit | null {
  let best: Unit | null = null;
  for (const u of units) {
    if (u.start <= line && line <= u.end && (!best || u.end - u.start < best.end - best.start)) best = u;
  }
  return best;
}

// Package name from an import source: "jose" -> "jose", "@scope/pkg/sub" -> "@scope/pkg"; null for relative paths.
export function packageName(source: string): string | null {
  if (source.startsWith(".") || source.startsWith("/")) return null;
  const parts = source.split("/");
  return source.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? null);
}

// Resolves a relative import to a file in the repo, or null.
export function resolveImport(fromPath: string, source: string, files: Set<string>): string | null {
  if (!source.startsWith(".")) return null;
  const dir = fromPath.split("/").slice(0, -1);
  for (const part of source.split("/")) {
    if (part === "..") dir.pop();
    else if (part !== ".") dir.push(part);
  }
  const base = dir.join("/");
  const stem = base.replace(/\.(js|jsx|mjs|cjs)$/, "");
  const candidates = [base];
  for (const ext of ["ts", "tsx", "mts", "js", "jsx", "mjs", "cjs"]) {
    candidates.push(`${stem}.${ext}`, `${base}/index.${ext}`);
  }
  return candidates.find((c) => files.has(c)) ?? null;
}

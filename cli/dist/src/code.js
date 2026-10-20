// Reads TS/JS source with the TypeScript compiler: the functions in a file and what they call.
import ts from "typescript";
export const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const HTTP_ROUTE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//;
const TEST_CALLS = new Set(["it", "test"]);
function scriptKind(path) {
    if (/\.tsx$/.test(path))
        return ts.ScriptKind.TSX;
    if (/\.jsx$/.test(path))
        return ts.ScriptKind.JSX;
    if (/\.(js|mjs|cjs)$/.test(path))
        return ts.ScriptKind.JS;
    return ts.ScriptKind.TS;
}
function isFunctionLike(node) {
    return !!node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}
function stringValue(node) {
    return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}
function isDefaultExport(node) {
    return (node.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
}
function unitFor(node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
        return { name: `${node.name.text}()`, kind: "fn", local: node.name.text, isDefault: isDefaultExport(node) };
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isFunctionLike(node.initializer)) {
        return { name: `${node.name.text}()`, kind: "fn", local: node.name.text };
    }
    if (ts.isMethodDeclaration(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
        const cls = ts.isClassLike(node.parent) ? node.parent.name?.text : undefined;
        const method = node.name.text;
        return cls ? { name: `${cls}.${method}()`, kind: "fn", cls, method } : { name: `${method}()`, kind: "fn" };
    }
    if (ts.isPropertyAssignment(node) && isFunctionLike(node.initializer)) {
        const key = stringValue(node.name);
        if (key && HTTP_ROUTE.test(key))
            return { name: key, kind: "route" };
    }
    if (ts.isCallExpression(node)) {
        let callee = node.expression;
        if (ts.isPropertyAccessExpression(callee))
            callee = callee.expression; // it.only, test.skip
        const title = stringValue(node.arguments[0]);
        if (ts.isIdentifier(callee) && TEST_CALLS.has(callee.text) && title && node.arguments.some(isFunctionLike)) {
            return { name: title, kind: "case" };
        }
    }
    return null;
}
// The `Class` in `new Class(…)`, if that's what the node is (parentheses allowed).
function newOf(node) {
    const inner = ts.isParenthesizedExpression(node) ? node.expression : node;
    return ts.isNewExpression(inner) && ts.isIdentifier(inner.expression) ? inner.expression.text : null;
}
// A call target as written: "name", "x.name" or "Class#name". See Unit.calls.
function targetName(expr) {
    if (ts.isIdentifier(expr))
        return expr.text;
    if (!ts.isPropertyAccessExpression(expr))
        return null;
    const obj = expr.expression, member = expr.name.text;
    if (obj.kind === ts.SyntaxKind.ThisKeyword)
        return `this.${member}`;
    if (ts.isIdentifier(obj))
        return `${obj.text}.${member}`;
    const cls = newOf(obj);
    return cls ? `${cls}#${member}` : null;
}
// What a node calls: the callee of a call, `new` or JSX element, plus functions handed over by name as an
// argument (`list.map(build)`) or a JSX prop (`onClick={save}`). Names that aren't functions resolve to nothing.
function callsIn(node) {
    const targets = [];
    if (ts.isCallExpression(node) || ts.isNewExpression(node))
        targets.push(node.expression, ...(node.arguments ?? []));
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        targets.push(node.tagName);
        for (const attr of node.attributes.properties) {
            if (ts.isJsxAttribute(attr) && attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
                targets.push(attr.initializer.expression);
            }
        }
    }
    return targets.map(targetName).filter((name) => name !== null);
}
function readReExport(node, reexports) {
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier))
        return;
    const source = node.moduleSpecifier.text;
    if (!node.exportClause)
        reexports.push({ source, names: "*" });
    else if (ts.isNamedExports(node.exportClause)) {
        const names = new Map(node.exportClause.elements.map((el) => [el.name.text, (el.propertyName ?? el.name).text]));
        reexports.push({ source, names });
    }
}
function readImport(node, imports) {
    if (!ts.isStringLiteral(node.moduleSpecifier))
        return;
    const source = node.moduleSpecifier.text;
    const clause = node.importClause;
    if (clause?.name)
        imports.set(clause.name.text, { source, imported: "default" });
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements)
            imports.set(el.name.text, { source, imported: (el.propertyName ?? el.name).text });
    }
    if (bindings && ts.isNamespaceImport(bindings))
        imports.set(bindings.name.text, { source, imported: "*" });
}
export function readCode(path, text) {
    const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(path));
    const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
    const parsed = { units: [], imports: new Map(), reexports: [], classes: new Map(), instances: new Map() };
    function visit(node, owner) {
        if (ts.isClassDeclaration(node) && node.name) {
            parsed.classes.set(node.name.text, { isDefault: isDefaultExport(node), methods: new Map() });
        }
        // `const x = new Class(…)`: remember the class, so `x.method()` can be followed
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
            const cls = newOf(node.initializer);
            if (cls)
                (owner?.instances ?? parsed.instances).set(node.name.text, cls);
        }
        const head = unitFor(node);
        if (head) {
            owner = { ...head, start: lineOf(node.getStart(sf)), end: lineOf(node.getEnd()), calls: new Set(), instances: new Map() };
            parsed.units.push(owner);
            if (owner.cls && owner.method)
                parsed.classes.get(owner.cls)?.methods.set(owner.method, owner);
        }
        if (ts.isImportDeclaration(node))
            readImport(node, parsed.imports);
        if (ts.isExportDeclaration(node))
            readReExport(node, parsed.reexports);
        if (owner)
            for (const name of callsIn(node))
                owner.calls.add(name);
        ts.forEachChild(node, (child) => visit(child, owner));
    }
    visit(sf, null);
    return parsed;
}
// The innermost unit that contains a line, or null for module-level code.
export function unitAt(units, line) {
    let best = null;
    for (const u of units) {
        if (u.start <= line && line <= u.end && (!best || u.end - u.start < best.end - best.start))
            best = u;
    }
    return best;
}
// Package name from an import source: "jose" -> "jose", "@scope/pkg/sub" -> "@scope/pkg"; null for relative paths.
export function packageName(source) {
    if (source.startsWith(".") || source.startsWith("/"))
        return null;
    const parts = source.split("/");
    return source.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? null);
}

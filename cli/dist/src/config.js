import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { gitDir } from "./git.js";
const DEFAULT_URL = "https://glance.nishilfaldu.site";
// Publish settings come from env vars first, then ~/.config/glance/config.json. Briefs go to the publisher's
// own Vercel Blob store (BLOB_READ_WRITE_TOKEN); the Glance site at url only serves the viewer.
export function publishSettings() {
    const configPath = join(homedir(), ".config", "glance", "config.json");
    const file = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
    return {
        url: (process.env.GLANCE_URL || file.url || DEFAULT_URL).replace(/\/+$/, ""),
        blobToken: process.env.BLOB_READ_WRITE_TOKEN || file.blobToken || null,
        configPath,
    };
}
// Brief ids per branch live inside .git so a pull request keeps one link across pushes.
function idsPath(root) {
    return join(gitDir(root), "glance", "briefs.json");
}
function readIds(path) {
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}
export function savedId(root, branch) {
    return readIds(idsPath(root))[branch] ?? null;
}
export function saveId(root, branch, id) {
    const path = idsPath(root);
    const ids = readIds(path);
    ids[branch] = id;
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(ids, null, 2) + "\n");
}
// .glance.yml, in the repo root:
//   skip:
//     - generated/**
//   flags:
//     - name: env var with a fallback
//       added: process\.env\.\w+\s*(\?\?|\|\|)
//     - name: payments code
//       path: src/payments/**
export function readGlanceYml(text) {
    const config = { skip: [], flags: [] };
    if (!text)
        return config;
    let raw;
    try {
        raw = parse(text);
    }
    catch (err) {
        throw configError(err instanceof Error ? err.message : String(err));
    }
    if (raw === null || raw === undefined)
        return config;
    if (!isMap(raw))
        throw configError("expected a map with skip: and flags:");
    for (const key of Object.keys(raw)) {
        if (key !== "skip" && key !== "flags")
            throw configError(`unknown key "${key}"; expected skip or flags`);
    }
    config.skip = listOf(raw.skip, "skip").map((glob, i) => {
        if (typeof glob !== "string")
            throw configError(`skip[${i}] must be a path pattern`);
        return globToRegExp(glob);
    });
    config.flags = listOf(raw.flags, "flags").map((rule, i) => {
        if (!isMap(rule))
            throw configError(`flags[${i}] must have a name and a path, added or removed`);
        const { name, path, added, removed, ...rest } = rule;
        const where = typeof name === "string" ? `flag "${name}"` : `flags[${i}]`;
        if (typeof name !== "string" || !name.trim())
            throw configError(`${where} needs a name`);
        const extra = Object.keys(rest)[0];
        if (extra)
            throw configError(`${where} has unknown key "${extra}"; expected name, path, added or removed`);
        if (path === undefined && added === undefined && removed === undefined) {
            throw configError(`${where} needs a path, added or removed`);
        }
        const out = { name: name.trim() };
        if (path !== undefined) {
            if (typeof path !== "string")
                throw configError(`${where}: path must be a path pattern`);
            out.path = globToRegExp(path);
        }
        if (added !== undefined)
            out.added = regex(added, `${where}: added`);
        if (removed !== undefined)
            out.removed = regex(removed, `${where}: removed`);
        return out;
    });
    return config;
}
function configError(message) {
    return new Error(`.glance.yml: ${message}`);
}
function isMap(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function listOf(value, key) {
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value))
        throw configError(`${key} must be a list`);
    return value;
}
function regex(value, where) {
    if (typeof value !== "string")
        throw configError(`${where} must be a regular expression`);
    try {
        return new RegExp(value);
    }
    catch (err) {
        throw configError(`${where} is not a valid regular expression (${err instanceof Error ? err.message : err})`);
    }
}
// "**/" matches any number of folders, "*" anything but "/", "?" one character.
export function globToRegExp(glob) {
    let re = "";
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i] ?? "";
        if (c === "*" && glob[i + 1] === "*") {
            i++;
            if (glob[i + 1] === "/") {
                re += "(?:.*/)?";
                i++;
            }
            else
                re += ".*";
        }
        else if (c === "*")
            re += "[^/]*";
        else if (c === "?")
            re += "[^/]";
        else
            re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(`^${re}$`);
}

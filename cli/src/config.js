import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gitDir } from "./git.js";

const DEFAULT_URL = "https://glance-mu-three.vercel.app";

// Publish settings come from env vars first, then ~/.config/glance/config.json. Briefs go to the publisher's
// own Vercel Blob store (BLOB_READ_WRITE_TOKEN); the Glance site at url only serves the viewer.
export function publishSettings() {
  let file = {};
  const path = join(homedir(), ".config", "glance", "config.json");
  if (existsSync(path)) file = JSON.parse(readFileSync(path, "utf8"));
  return {
    url: (process.env.GLANCE_URL || file.url || DEFAULT_URL).replace(/\/+$/, ""),
    blobToken: process.env.BLOB_READ_WRITE_TOKEN || file.blobToken || null,
    configPath: path,
  };
}

// Brief ids per branch live inside .git so a pull request keeps one link across pushes.
function idsPath(root) {
  return join(gitDir(root), "glance", "briefs.json");
}

export function savedId(root, branch) {
  const path = idsPath(root);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"))[branch] || null;
}

export function saveId(root, branch, id) {
  const path = idsPath(root);
  const ids = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  ids[branch] = id;
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(ids, null, 2) + "\n");
}

// .glance.yml supports simple lists only:
//   skip:
//     - generated/**
export function parseGlanceYml(text) {
  const out = { skip: [] };
  if (!text) return out;
  let key = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    const head = line.match(/^([A-Za-z_]+):\s*$/);
    if (head) { key = head[1]; continue; }
    const item = line.match(/^\s*-\s*["']?([^"']+?)["']?\s*$/);
    if (item && key && Array.isArray(out[key])) out[key].push(item[1]);
  }
  return out;
}

export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") { re += "(?:.*/)?"; i++; }
      else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

// Shared helpers for the brief API. Files starting with "_" are not deployed as functions.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const ID_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;
const MAX_BYTES = 4 * 1024 * 1024;

export function blobPath(id) {
  return `briefs/${id}.json`;
}

export function newId() {
  return randomBytes(16).toString("base64url"); // 128 bits
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

// Compares hashes so the check takes the same time whatever the input.
export function hasPublishKey(request) {
  const expected = process.env.GLANCE_PUBLISH_KEY;
  if (!expected) return false;
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function checkBrief(brief, size) {
  if (size > MAX_BYTES) return "Brief is larger than 4 MB.";
  if (!brief || typeof brief !== "object") return "Body must be a JSON object.";
  for (const key of ["repo", "title", "head", "base"]) {
    if (typeof brief[key] !== "string") return `Brief is missing "${key}".`;
  }
  if (!brief.root || typeof brief.root !== "object") return 'Brief is missing "root".';
  return null;
}

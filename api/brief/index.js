// POST /api/brief — store a brief and return its secret link.
// Body: { id?: string, brief: object }. Passing the id from an earlier publish overwrites it,
// so a pull request keeps one link across pushes.
import { put } from "@vercel/blob";
import { ID_PATTERN, blobPath, checkBrief, hasPublishKey, json, newId } from "../_brief.js";

export async function POST(request) {
  if (!hasPublishKey(request)) return json(401, { error: "Missing or wrong publish key." });

  const text = await request.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: "Body must be valid JSON." });
  }

  const problem = checkBrief(body && body.brief, text.length);
  if (problem) return json(400, { error: problem });

  let id = body.id;
  if (id !== undefined && !ID_PATTERN.test(id)) return json(400, { error: "Invalid id." });
  id = id || newId();

  await put(blobPath(id), JSON.stringify(body.brief), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  const origin = new URL(request.url).origin;
  return json(200, { id, url: `${origin}/r/${id}` });
}

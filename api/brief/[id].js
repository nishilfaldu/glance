// GET /api/brief/:id — read a brief from private Blob storage.
import { get } from "@vercel/blob";
import { ID_PATTERN, blobPath, json } from "../_brief.js";

export async function GET(request) {
  const id = new URL(request.url).pathname.split("/").pop();
  if (!ID_PATTERN.test(id)) return json(404, { error: "Brief not found." });

  const result = await get(blobPath(id), { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return json(404, { error: "Brief not found." });

  return new Response(result.stream, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

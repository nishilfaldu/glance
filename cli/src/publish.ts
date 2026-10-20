// Uploads a brief to the publisher's own public Vercel Blob store. The link names the store and id after "#",
// so the site serving the viewer never learns which brief is opened, and storage is billed to the publisher.
import { randomBytes } from "node:crypto";
import { put, type PutBlobResult } from "@vercel/blob";
import type { Brief } from "./brief.js";

function newId(): string {
  return randomBytes(16).toString("base64url"); // 128 bits
}

// Passing the id from an earlier publish overwrites that brief, so a pull request keeps one link across pushes.
export async function publishBrief(
  brief: Brief,
  { id, token, siteUrl }: { id: string | null; token: string; siteUrl: string },
): Promise<{ id: string; url: string }> {
  const briefId = id || newId();
  let blob: PutBlobResult;
  try {
    blob = await put(`glance/${briefId}.json`, JSON.stringify(brief), {
      access: "public",
      token,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60, // republished briefs show up within a minute
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message.replace(/\.$/, "") : String(err);
    throw new Error(`Upload to Vercel Blob failed: ${reason}. The token must belong to a public Blob store.`);
  }
  const store = new URL(blob.url).hostname.split(".")[0];
  return { id: briefId, url: `${siteUrl}/r#${store}/${briefId}` };
}

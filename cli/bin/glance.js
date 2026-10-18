#!/usr/bin/env node
import { parseArgs } from "node:util";
import { analyze } from "../src/analyze.js";
import { publishSettings, saveId, savedId } from "../src/config.js";
import { openInBrowser, serveLocally } from "../src/serve.js";

const HELP = `glance: map a branch's changes for review

Usage
  glance [options]           Open the review page for this branch in your browser
  glance publish [options]   Upload it and print a secret link for the pull request
  glance json [options]      Print the brief as JSON

Options
  --base <ref>     Branch to compare against (default: origin's default branch, then main/master)
  --head <ref>     Commit or branch to review (default: HEAD)
  --title <text>   Title shown on the page (default: first commit message on the branch)
  --port <n>       Port for the local page (default: any free port)
  --no-open        Start the local page without opening a browser
  -h, --help       Show this help

Publishing reads GLANCE_PUBLISH_KEY and GLANCE_URL, or ~/.config/glance/config.json.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string" },
    head: { type: "string", default: "HEAD" },
    title: { type: "string" },
    port: { type: "string", default: "0" },
    "no-open": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

async function main() {
  const command = positionals[0] || "open";
  if (values.help || !["open", "publish", "json"].includes(command)) {
    console.log(HELP);
    process.exit(values.help ? 0 : 1);
  }

  const { brief, stats, root } = analyze({ cwd: process.cwd(), base: values.base, head: values.head, title: values.title });

  if (command === "json") {
    process.stdout.write(`${JSON.stringify(brief, null, 2)}\n`);
    return;
  }

  console.error(`${brief.head} → ${brief.base}: ${stats.files} files, ${stats.functions} functions, ${stats.flags} flagged`);

  if (command === "publish") {
    const { url, publishKey, configPath } = publishSettings();
    if (!publishKey) throw new Error(`No publish key. Set GLANCE_PUBLISH_KEY or add "publishKey" to ${configPath}.`);
    const id = savedId(root, brief.head);
    const res = await fetch(`${url}/api/brief`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${publishKey}` },
      body: JSON.stringify(id ? { id, brief } : { brief }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Publish failed (${res.status}): ${body.error || "no details"}`);
    saveId(root, brief.head, body.id);
    console.log(body.url);
    return;
  }

  const url = await serveLocally(brief, Number(values.port));
  console.error(`Review page: ${url}  (Ctrl+C to stop)`);
  if (!values["no-open"]) openInBrowser(url);
}

main().catch((err) => {
  console.error(`glance: ${err.message}`);
  process.exit(1);
});

#!/usr/bin/env node
import { parseArgs } from "node:util";
import { analyze } from "../src/analyze.js";
import { publishSettings, saveId, savedId } from "../src/config.js";
import { findPullRequest, linkOnPullRequest } from "../src/pr.js";
import { publishBrief } from "../src/publish.js";
import { openInBrowser, serveLocally } from "../src/serve.js";
const HELP = `glance: map a branch's changes for review

Usage
  glance [options]           Open the review page for this branch in your browser
  glance publish [options]   Upload it to your Vercel Blob store and print a link for the pull request
  glance json [options]      Print the brief as JSON

Options
  --base <ref>     Branch to compare against (default: origin's default branch, then main/master)
  --head <ref>     Commit or branch to review (default: HEAD)
  --working        Include uncommitted changes, staged or not, and untracked files.
                   For your own review; it can't be published.
  --title <text>   Title shown on the page (default: the pull request's title with --pr,
                   otherwise the first commit message on the branch)
  --pr [number]    With publish: put the link in the pull request's description
                   (default: the pull request for this branch). Uses the gh CLI.
  --port <n>       Port for the local page (default: any free port)
  --no-open        Start the local page without opening a browser
  -h, --help       Show this help

.glance.yml in the repo root lists files to skip and your own flag rules:
  skip:
    - generated/**
  flags:
    - name: env var with a fallback
      added: process\\.env\\.\\w+\\s*(\\?\\?|\\|\\|)    (also: path, removed)

Publishing needs BLOB_READ_WRITE_TOKEN, the token of a public Vercel Blob store you own, or "blobToken"
in ~/.config/glance/config.json. GLANCE_URL (or "url") picks the site that shows the page.`;
const COMMANDS = ["open", "publish", "json"];
// "--pr" may stand alone (this branch's pull request) or take a number.
const args = process.argv.slice(2).map((arg, i, all) => (arg === "--pr" && !/^\d+$/.test(all[i + 1] ?? "") ? "--pr=current" : arg));
const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
        base: { type: "string" },
        head: { type: "string", default: "HEAD" },
        title: { type: "string" },
        pr: { type: "string" },
        working: { type: "boolean", default: false },
        port: { type: "string", default: "0" },
        "no-open": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
    },
});
function isCommand(name) {
    return COMMANDS.includes(name);
}
async function main() {
    const command = positionals[0] ?? "open";
    if (values.help || !isCommand(command)) {
        console.log(HELP);
        process.exit(values.help ? 0 : 1);
    }
    if (values.pr && command !== "publish")
        throw new Error("--pr only works with glance publish.");
    if (values.working && command === "publish")
        throw new Error("--working is for your own review. Commit and push, then publish.");
    if (values.working && values.head !== "HEAD")
        throw new Error("--working reviews the current checkout; leave out --head.");
    const cwd = process.cwd();
    const pull = values.pr ? findPullRequest(cwd, values.pr === "current" ? null : values.pr) : null;
    const { brief, stats, root } = analyze({
        cwd,
        base: values.base,
        head: values.head,
        working: values.working,
        title: values.title || pull?.title,
    });
    if (command === "json") {
        process.stdout.write(`${JSON.stringify(brief, null, 2)}\n`);
        return;
    }
    console.error(`${brief.head} → ${brief.base}: ${stats.files} files, ${stats.functions} functions, ${stats.flags} flagged`);
    if (command === "publish") {
        const { url, blobToken, configPath } = publishSettings();
        if (!blobToken) {
            throw new Error(`Publishing uploads to your own Vercel Blob store. Set BLOB_READ_WRITE_TOKEN (from a public store) ` +
                `or add "blobToken" to ${configPath}. Without one, run glance to review locally.`);
        }
        const published = await publishBrief(brief, { id: savedId(root, brief.head), token: blobToken, siteUrl: url });
        saveId(root, brief.head, published.id);
        console.log(published.url);
        if (pull) {
            linkOnPullRequest(cwd, pull, published.url);
            console.error(`Linked on ${pull.url}`);
        }
        return;
    }
    const url = await serveLocally(brief, Number(values.port));
    console.error(`Review page: ${url}  (Ctrl+C to stop)`);
    if (!values["no-open"])
        openInBrowser(url);
}
main().catch((err) => {
    console.error(`glance: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});

// Reads and updates a pull request through the GitHub CLI, as the signed-in user.
import { execFileSync } from "node:child_process";

const BLOCK = /<!-- glance -->[\s\S]*?<!-- \/glance -->/;

function gh(cwd, args, input) {
  try {
    return execFileSync("gh", args, { cwd, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
  } catch (err) {
    if (err.code === "ENOENT") throw new Error("Install the GitHub CLI (gh) to link pull requests.");
    throw err;
  }
}

// The pull request for a number, or for the current branch when number is null.
export function findPullRequest(cwd, number) {
  try {
    return JSON.parse(gh(cwd, ["pr", "view", ...(number ? [number] : []), "--json", "number,title,body,url"]));
  } catch (err) {
    if (err.message.startsWith("Install")) throw err;
    throw new Error(number ? `Couldn't find pull request ${number}.` : "Couldn't find a pull request for this branch. Pass one with --pr <number>.");
  }
}

// Replaces the marked block if the description already has one, so republishing never adds a second link.
export function linkOnPullRequest(cwd, pull, url) {
  const block = `<!-- glance -->\n**Review map:** ${url}\n<!-- /glance -->`;
  const body = (pull.body || "").trimEnd();
  const next = BLOCK.test(body) ? body.replace(BLOCK, block) : body ? `${body}\n\n${block}` : block;
  if (next !== body) gh(cwd, ["pr", "edit", String(pull.number), "--body-file", "-"], next);
}

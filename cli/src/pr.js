// Puts the review link in a pull request's description through the GitHub CLI, as the signed-in user.
import { execFileSync } from "node:child_process";

const BLOCK = /<!-- glance -->[\s\S]*?<!-- \/glance -->/;

function gh(root, args, input) {
  try {
    return execFileSync("gh", args, { cwd: root, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
  } catch (err) {
    if (err.code === "ENOENT") throw new Error("Install the GitHub CLI (gh) to link pull requests.");
    throw err;
  }
}

// Replaces the marked block if the description already has one, so republishing never adds a second link.
export function linkOnPullRequest(root, pr, url) {
  let view;
  try {
    view = JSON.parse(gh(root, ["pr", "view", ...(pr ? [pr] : []), "--json", "number,body,url"]));
  } catch (err) {
    if (err.message.startsWith("Install")) throw err;
    throw new Error(pr ? `Couldn't find pull request ${pr}.` : "Couldn't find a pull request for this branch. Pass one with --pr <number>.");
  }
  const block = `<!-- glance -->\n**Review map:** ${url}\n<!-- /glance -->`;
  const body = (view.body || "").trimEnd();
  const next = BLOCK.test(body) ? body.replace(BLOCK, block) : body ? `${body}\n\n${block}` : block;
  if (next !== body) gh(root, ["pr", "edit", String(view.number), "--body-file", "-"], next);
  return view.url;
}

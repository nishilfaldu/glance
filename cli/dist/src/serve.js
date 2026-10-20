// Serves the same viewer the hosted site uses, with the brief from memory, on localhost.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
// Compiled to cli/dist/src/serve.js; the viewer ships at public/viewer.html.
const VIEWER = new URL("../../../public/viewer.html", import.meta.url);
const LOCAL_ID = "local";
export function serveLocally(brief, port) {
    const viewer = readFileSync(VIEWER);
    const body = JSON.stringify(brief);
    const server = createServer((req, res) => {
        const path = (req.url ?? "/").split("?")[0];
        if (path === `/r/${LOCAL_ID}`) {
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(viewer);
        }
        else if (path === `/api/brief/${LOCAL_ID}`) {
            res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }).end(body);
        }
        else {
            res.writeHead(302, { location: `/r/${LOCAL_ID}` }).end();
        }
    });
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        // Bind to localhost only: the brief describes private code.
        server.listen(port, "127.0.0.1", () => {
            const address = server.address();
            const bound = typeof address === "object" && address ? address.port : port;
            resolve(`http://127.0.0.1:${bound}/r/${LOCAL_ID}`);
        });
    });
}
export function openInBrowser(url) {
    const [cmd, args] = process.platform === "darwin" ? ["open", [url]] :
        process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] :
            ["xdg-open", [url]];
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

// Static file server for the browser tests: node scripts/serve-static.mjs [port] [root]
//
// Python's `http.server` (backlog 5) resets connections when a test page loads
// many files at once with the cache disabled. When game.js was the one reset,
// the page had no game code and the tutorial test failed at random. This server
// listens with a large backlog and never caches, so every run fetches fresh files.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const port = Number(process.argv[2]) || 8010;
const root = path.resolve(process.argv[3] || ".");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".ico": "image/x-icon", ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
};

const dir = root;
const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
    let file = path.join(dir, pathname);
    // Stay inside the root.
    if (file !== dir && !file.startsWith(dir + path.sep)) { res.writeHead(403).end(); return; }
    fs.stat(file, (err, stat) => {
      if (!err && stat.isDirectory()) { file = path.join(file, "index.html"); }
      fs.stat(file, (err2, stat2) => {
        if (err2 || !stat2.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }).end("not found"); return; }
        res.writeHead(200, {
          "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
          "Content-Length": stat2.size,
          "Cache-Control": "no-store",
        });
        if (req.method === "HEAD") { res.end(); return; }
        fs.createReadStream(file).pipe(res);
      });
    });
});
server.listen({ port, host: "127.0.0.1", backlog: 511 }, () => console.log(`serving ${root} at http://127.0.0.1:${port}`));

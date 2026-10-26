"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("coop.html"), css = read("coop.css"), script = read("coop.js"), solo = read("index.html");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "co-op IDs must remain unique");
for (const [, id] of script.matchAll(/\$\("#([^"]+)"\)/g))
  assert.ok(ids.includes(id), `existing co-op control #${id} is preserved`);
for (const asset of ["assets/fonts/Bungee-Regular.ttf", "assets/fonts/GowunBatang-Regular.ttf", "assets/its-my-turn-check-desktop-art.webp"]) {
  assert.ok(fs.existsSync(path.join(root, asset)));
  assert.ok(css.includes(asset), "co-op loads the actual shared asset");
  assert.ok(solo.includes(asset), "co-op and solo share the same asset");
  assert.ok(html.includes(asset), "critical assets are preloaded");
}
assert.ok(/font-family:\s*"Gowun Batang"/.test(css));
assert.ok(css.includes('"Bungee", sans-serif'));
assert.ok(!css.includes("Impact"), "legacy co-op title font is removed");
assert.ok(html.includes('for="roomInput"') && html.includes('aria-live="polite"'));
assert.ok(css.includes('data-screen="gameScreen"'), "key art does not obscure the game board");
assert.ok(/dataset\.screen\s*=\s*which\.id/.test(script));
const lobby = html.match(/<section id="lobby"[\s\S]*?<\/section>/)[0];
assert.ok(!lobby.includes("roomInput") && !lobby.includes('class="intro"'), "lobby does not expose code fields or explanatory paragraphs");
assert.ok(lobby.includes('id="openJoinButton"') && lobby.includes('id="howToPlayButton"'));
assert.ok(html.includes('<dialog id="joinDialog"') && html.includes('<dialog id="helpDialog"'));
assert.ok(/<form id="joinForm"[\s\S]*?id="roomInput"[\s\S]*?id="joinButton"[\s\S]*?<\/form>/.test(html), "code and submit action live in a real form");
assert.ok(html.includes('placeholder="ABC234"'), "example code follows the accepted alphabet");
assert.ok(script.includes('$("#joinForm").addEventListener("submit"') && script.includes("event.preventDefault()"));
assert.ok(!script.includes("__coopUi"), "browser fixture hooks never ship");
console.log("co-op UI contract tests passed: shared art/fonts, preserved controls, screen styles and input labels");

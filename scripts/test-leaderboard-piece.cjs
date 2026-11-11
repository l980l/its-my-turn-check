const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");

// Rankings show each record's piece and date, and a solo run submits its piece.
const urls = [], submits = [];
const rows = [
  { name: "Alpha", piece: "knight", score: 1200, message: "", created_at: "2026-11-10T03:00:00Z" },
  { name: "Old", piece: null, score: 900, message: "", created_at: "2026-08-28T03:00:00Z" },
];
const h = createGameHarness({
  fetch: async (url, options = {}) => {
    urls.push(url);
    if (url.includes("/functions/v1/")) {
      submits.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, text: async () => JSON.stringify(rows) };
  },
});
const { S, ui, loadLeaderboard, submitScore } = h.game;
const text = (node) => typeof node === "string" ? node : (node.text || "") + node.children.map(text).join("");

(async () => {
  await loadLeaderboard();
  assert.ok(urls[0].includes("select=name,piece,score,message,created_at"), "the solo query asks for the piece");
  const [alpha, old] = ui.leaderboardList.children;
  const [, name, score] = alpha.children;
  const icon = name.children[0].children[0];
  assert.equal(icon.className, "leaderboard-piece");
  assert.equal(icon.text, "♞︎", "a knight record shows the knight glyph");
  assert.equal(icon.title, "나이트");
  assert.equal(text(name), "♞︎Alpha");
  assert.equal(score.children.at(-1).className, "leaderboard-date");
  assert.equal(score.children.at(-1).text, "2026.11.10", "each record shows its date");
  assert.equal(text(old.children[1]), "Old", "an older record without a piece shows the name alone");
  assert.equal(old.children[2].children.at(-1).text, "2026.08.28");

  h.reset();
  S.player.piece = "bishop";
  S.finalScore = 4321;
  S.runTicket = { runId: "run-1", runToken: "token-1" };
  ui.scoreName.value = "Beta";
  await submitScore();
  assert.equal(submits.length, 1);
  assert.equal(submits[0].piece, "bishop", "the submission carries the piece the run ended as");
  console.log("leaderboard piece tests passed: glyph, date, older records, solo submission");
})();

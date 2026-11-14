const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");

// The pager counts pages from the board's total (Content-Range), and an empty
// tab says so instead of showing a "1–0위" range.
let rows = [];
let range = "*/0";
const urls = [];
const requests = [];
const h = createGameHarness({
  fetch: async (url, options = {}) => {
    urls.push(url);
    requests.push(options);
    return { ok: true, headers: { get: (name) => (name === "content-range" ? range : null) }, text: async () => JSON.stringify(rows) };
  },
});
const { ui, loadLeaderboard } = h.game;
const row = (score) => ({ name: "P" + score, piece: "queen", score, message: "", created_at: "2026-11-12T03:00:00Z" });

(async () => {
  await loadLeaderboard();
  assert.equal(requests.at(-1).headers.Prefer, "count=exact", "the board request asks for the total");
  assert.equal(ui.rankingPage.textContent, "1 / 1", "an empty board has one page");
  assert.equal(ui.rankingNext.disabled, true);
  assert.equal(ui.leaderboardStatus.textContent, "아직 기록이 없습니다", "an empty board has no rank range");

  rows = [row(3), row(2), row(1)];
  range = "0-2/3";
  await loadLeaderboard();
  assert.equal(ui.rankingPage.textContent, "1 / 1", "three records fit on one page");
  assert.equal(ui.leaderboardStatus.textContent, "TOP 1,000 · 1–3위 · 점수 기준");

  rows = Array.from({ length: 10 }, (_, index) => row(100 - index));
  range = "0-9/23";
  await loadLeaderboard();
  assert.equal(ui.rankingPage.textContent, "1 / 3", "23 records make three pages");
  assert.equal(ui.rankingNext.disabled, false);

  rows = Array.from({ length: 10 }, (_, index) => row(100 - index));
  range = "0-9/20";
  await loadLeaderboard(1);
  assert.equal(ui.rankingPage.textContent, "2 / 2");
  assert.equal(ui.rankingNext.disabled, true, "a full last page has no next page");

  range = "0-9/50000";
  await loadLeaderboard();
  assert.equal(ui.rankingPage.textContent, "1 / 100", "the pager stops at TOP 1,000");

  range = null;
  await loadLeaderboard();
  assert.equal(ui.rankingPage.textContent, "1 / 100", "without a total the pager keeps the TOP 1,000 range");

  rows = [];
  range = "*/0";
  ui.rankingCoop.handlers.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ui.leaderboardStatus.textContent, "2인 · 아직 기록이 없습니다", "the empty status names the board");
  console.log("ranking pager tests passed: totals, empty boards, last page, TOP 1,000 cap, missing header");
})();

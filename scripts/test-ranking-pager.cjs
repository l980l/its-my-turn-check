const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");

// The pager counts pages from the board's total (Content-Range), and an empty
// tab says so in the middle of the list.
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
  assert.equal(ui.leaderboardList.children[0].textContent, "기록이 아직 없습니다.\n첫 번째 기록을 남겨보세요.", "the empty board says so in the list");

  rows = [row(3), row(2), row(1)];
  range = "0-2/3";
  await loadLeaderboard();
  assert.equal(ui.rankingPage.textContent, "1 / 1", "three records fit on one page");
  assert.equal(ui.leaderboardList.children.length, 3, "three rows render");

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
  ui.rankingTabs.children.find((button) => button.dataset.category === "coop").handlers.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ui.leaderboardList.children[0].textContent, "기록이 아직 없습니다.\n첫 번째 기록을 남겨보세요.", "an empty co-op board says so too");
  // Short screens show five rows a page; the pager and offsets follow.
  h.context.matchMedia = (query) => ({ matches: query === "(max-height: 799px)" });
  ui.rankingTabs.children[0].handlers.click();
  rows = Array.from({ length: 5 }, (_, index) => row(100 - index));
  range = "5-9/23";
  await loadLeaderboard(1);
  assert.ok(urls.at(-1).includes("&limit=5&offset=5"), "a compact page asks for five rows");
  assert.equal(ui.rankingPage.textContent, "2 / 5", "23 records make five compact and landscape pages, errors");
  assert.equal(ui.leaderboardList.children[0].children[0].text, "06", "page 2 of five-row pages starts at 6th");
  range = null;
  await loadLeaderboard();
  assert.equal(ui.rankingPage.textContent, "1 / 200", "without a total the compact pager spans TOP 1,000");
  // Landscape phones (under 520px tall) show three rows a page.
  h.context.matchMedia = () => ({ matches: true });
  rows = Array.from({ length: 3 }, (_, index) => row(100 - index));
  range = "3-5/23";
  await loadLeaderboard(1);
  assert.ok(urls.at(-1).includes("&limit=3&offset=3"), "a landscape page asks for three rows");
  assert.equal(ui.rankingPage.textContent, "2 / 8", "23 records make eight three-row pages");

  // A failed request leaves a note in the list instead of a blank board.
  h.context.fetch = async () => ({ ok: false, text: async () => "down" });
  await loadLeaderboard().catch(() => {});
  assert.equal(ui.leaderboardList.children[0].textContent, "랭킹을 불러오지 못했습니다.\n잠시 후 다시 시도해주세요.");
  console.log("ranking pager tests passed: totals, empty boards, last page, TOP 1,000 cap, missing header, compact and landscape pages, errors");
})();

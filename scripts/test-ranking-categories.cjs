const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");

// The solo ranking has 종합, one tab per start piece and 레거시. 종합 and the
// piece tabs count records from v0.20.0 on; 레거시 holds the earlier ones.
const SINCE = "2026-11-11T15:48:55Z";
const urls = [];
const overall = [{ name: "Top", piece: "queen", score: 9000, message: "", created_at: "2026-11-12T03:00:00Z" }];
const kings = [{ name: "King", piece: "king", score: 4000, message: "", created_at: "2026-11-12T03:00:00Z" }];
let kingGate = null;
const h = createGameHarness({
  fetch: async (url) => {
    urls.push(url);
    if (kingGate && url.includes("piece=eq.king")) await kingGate;
    return {
      ok: true,
      headers: { get: () => "0-0/3" },
      text: async () => JSON.stringify(url.includes("piece=eq.king") ? kings : overall),
    };
  },
});
const { ui, loadLeaderboard, leaderboardRank, leaderboardCutoff } = h.game;
const tabs = () => ui.rankingCategories.children;
const tab = (category) => tabs().find((button) => (button.dataset.category || null) === category);
const settle = () => new Promise((resolve) => setImmediate(resolve));

(async () => {
  assert.deepEqual(tabs().map((button) => button.dataset.category || "all"), ["all", "queen", "rook", "bishop", "knight", "king", "legacy"]);
  assert.equal(tab(null).text, "종합");
  assert.equal(tab("legacy").text, "레거시");
  assert.ok(tab("king").innerHTML.includes("킹"), "piece tabs carry the piece name");
  assert.equal(tab(null).attributes["aria-selected"], "true", "the overall tab starts selected");

  await loadLeaderboard();
  assert.ok(urls.at(-1).includes("&created_at=gte." + SINCE) && !urls.at(-1).includes("piece=eq."), "종합 counts v0.20.0 records of every piece");
  tab("king").handlers.click();
  await settle();
  assert.ok(urls.at(-1).includes("&created_at=gte." + SINCE + "&piece=eq.king"), "a piece tab filters by the start piece");
  assert.equal(tab("king").attributes["aria-selected"], "true");
  assert.equal(tab(null).attributes["aria-selected"], "false");
  assert.match(ui.leaderboardStatus.textContent, /^킹 · TOP 1,000/, "the status names the piece");
  tab("legacy").handlers.click();
  await settle();
  assert.ok(urls.at(-1).includes("&created_at=lt." + SINCE) && !urls.at(-1).includes("piece=eq."), "레거시 holds the earlier records");
  assert.match(ui.leaderboardStatus.textContent, /^레거시 · /);

  // Result-screen rank checks use the same board as 종합.
  await leaderboardRank(5000);
  assert.ok(urls.at(-1).includes("&created_at=gte." + SINCE), "the rank count skips legacy records");
  await leaderboardCutoff();
  assert.ok(urls.at(-1).includes("&created_at=gte." + SINCE), "the TOP 10,000 cutoff skips legacy records");

  // A slow response from an earlier tab does not overwrite the current one.
  let release;
  kingGate = new Promise((resolve) => (release = resolve));
  tab("king").handlers.click();
  tab("rook").handlers.click();
  await settle();
  assert.match(ui.leaderboardStatus.textContent, /^룩 · /);
  release();
  await settle();
  await settle();
  assert.match(ui.leaderboardStatus.textContent, /^룩 · /, "the latest tab wins");

  // The co-op board ignores the solo tabs.
  ui.rankingCoop.handlers.click();
  await settle();
  assert.ok(urls.at(-1).startsWith("https://ganvrpzlsmvbmcilerpq.supabase.co/rest/v1/coop_leaderboard") && !urls.at(-1).includes("created_at=") && !urls.at(-1).includes("piece=eq."));
  console.log("ranking category tests passed: 종합/piece/레거시 tabs, v0.20.0 cutoff, rank checks, status, stale responses, co-op board");
})();

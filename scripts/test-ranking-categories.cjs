const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");

// The solo ranking has 종합, one tab per start piece and 레거시. 종합 and the
// piece tabs count records from v0.20.0 on; 레거시 holds the earlier ones.
const SINCE = "2026-11-11T15:48:55Z";
const TOP_TEN = "https://ganvrpzlsmvbmcilerpq.supabase.co/rest/v1/leaderboard?select=score&created_at=gte." + SINCE + "&order=score.desc,created_at.asc&limit=10";
const urls = [];
const overall = [{ name: "Top", piece: "queen", score: 9000, message: "", created_at: "2026-11-12T03:00:00Z" }];
const topTen = Array.from({ length: 10 }, (_, index) => ({ score: 10000 - index * 100 }));
const kings = [{ name: "King", piece: "king", score: 4000, message: "", created_at: "2026-11-12T03:00:00Z" }];
let kingGate = null;
const h = createGameHarness({
  fetch: async (url) => {
    urls.push(url);
    if (kingGate && url.includes("piece=eq.king")) await kingGate;
    return {
      ok: true,
      headers: { get: () => "0-0/3" },
      text: async () => JSON.stringify(url.includes("piece=eq.king") ? kings : url.startsWith(TOP_TEN) ? topTen : overall),
    };
  },
});
const { ui, loadLeaderboard, leaderboardRank, leaderboardCutoff, offerScoreSubmission } = h.game;
const tabs = () => ui.rankingTabs.children;
const tab = (category) => tabs().find((button) => (button.dataset.category || null) === category);
// The score cell of the first row: 9,000 PTS on the overall mock, 4,000 PTS on the king one.
const firstScore = () => ui.leaderboardList.children[0]?.children?.[2]?.text;
const settle = () => new Promise((resolve) => setImmediate(resolve));

(async () => {
  assert.deepEqual(tabs().map((button) => button.dataset.category || "all"), ["all", "queen", "rook", "bishop", "knight", "king", "legacy", "coop"]);
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
  assert.equal(firstScore(), "4,000 PTS", "the king tab shows the king board");
  tab("legacy").handlers.click();
  await settle();
  assert.ok(urls.at(-1).includes("&created_at=lt." + SINCE) && !urls.at(-1).includes("piece=eq."), "레거시 holds the earlier records");

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
  assert.equal(firstScore(), "9,000 PTS");
  release();
  await settle();
  await settle();
  assert.equal(firstScore(), "9,000 PTS", "the latest tab wins over a slow king response");

  // The co-op board ignores the solo tabs.
  tab("coop").handlers.click();
  await settle();
  assert.ok(urls.at(-1).startsWith("https://ganvrpzlsmvbmcilerpq.supabase.co/rest/v1/coop_leaderboard") && !urls.at(-1).includes("created_at=") && !urls.at(-1).includes("piece=eq."));
  // The result screen's TOP 10 check reads the overall top ten, even while the
  // ranking screen shows another tab or five-row pages.
  h.context.matchMedia = (query) => ({ matches: query === "(max-height: 799px)" });
  tab("king").handlers.click();
  await settle();
  await offerScoreSubmission(9200);
  assert.ok(urls.includes(TOP_TEN), "the TOP 10 check asks for the overall top ten");
  assert.equal(ui.scoreSubmitTitle.textContent, "TOP 10 달성!", "9,200 beats the 10th score of 9,100");
  await offerScoreSubmission(9050);
  assert.equal(ui.scoreSubmitTitle.textContent, "TOP 10,000 진입!", "9,050 is below the 10th score of 9,100");
  assert.equal(tab("king").attributes["aria-selected"], "true", "checking a score leaves the ranking tab alone");
  // A 0-point run never reaches the board, so the result screen skips the rank estimate.
  const before = urls.length;
  await offerScoreSubmission(0);
  assert.equal(urls.length, before, "a 0-point run asks the server nothing");
  assert.equal(ui.resultRank.textContent, "0점 기록은 랭킹에 오르지 않습니다.");
  console.log("ranking category tests passed: 종합/piece/레거시 tabs, v0.20.0 cutoff, rank checks, stale responses, co-op board, TOP 10 check, 0-point result");
})();

const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");

// Solo runs start as a chosen piece, keep it, and earn the piece's score multiplier.
const submits = [];
const h = createGameHarness({
  fetch: async (url, options = {}) => {
    if (url.includes("/functions/v1/")) {
      const body = JSON.parse(options.body);
      if (body.action === "submit") submits.push(body);
      return { ok: true, json: async () => (body.action === "start" ? { runId: "run-1", runToken: "token-1" } : { ok: true }) };
    }
    return { ok: true, text: async () => "[]" };
  },
});
const { S, ui, openPieceSelect, openUpgrade, over, submitScore, reset, hud } = h.game;
const settle = () => new Promise((resolve) => setImmediate(resolve));
const choice = (piece) => ui.pieceSelectList.children.find((button) => button.dataset.piece === piece);

(async () => {
  openPieceSelect();
  assert.deepEqual(ui.pieceSelectList.children.map((button) => button.dataset.piece), ["queen", "rook", "bishop", "knight", "king"]);
  assert.ok(choice("king").innerHTML.includes("점수 ×2.0"), "each card shows its multiplier");
  assert.ok(choice("queen").innerHTML.includes("점수 ×1.0"));
  choice("knight").handlers.click();
  await settle();
  assert.equal(S.player.piece, "knight", "the run starts as the chosen piece");
  assert.equal(S.startPiece, "knight");
  assert.equal(S.running, true);
  hud();
  assert.equal(ui.scoreMultiplier.textContent, "×1.5", "the HUD shows the multiplier next to the score");

  openUpgrade();
  assert.equal(S.upgradeMode, "trait", "the first level-up is a trait reward, not a promotion");
  S.phase = "player";
  S.player.rank = 4;
  openUpgrade();
  assert.notEqual(S.upgradeMode, "fork", "no piece swap at level 5");
  assert.equal(S.player.piece, "knight");

  S.phase = "player";
  S.score = 1001;
  over();
  assert.equal(S.finalScore, 1502, "the final score is multiplied and rounded");
  assert.ok(ui.result.textContent.includes("1,001 × 1.5 = 1,502"), "the result shows the multiplication");
  S.player.piece = "queen";
  ui.scoreName.value = "Gamma";
  await submitScore();
  assert.equal(submits.at(-1).piece, "knight", "the ranking records the chosen piece");
  assert.equal(submits.at(-1).score, 1502);

  // Co-op and harness resets still start as a pawn with the old promotion path.
  reset();
  assert.equal(S.startPiece, null);
  assert.equal(S.player.piece, "pawn");
  hud();
  assert.equal(ui.scoreMultiplier.textContent, "", "no HUD multiplier without a chosen piece");
  openUpgrade();
  assert.equal(S.upgradeMode, "piece", "a pawn start still promotes on the first level-up");
  S.phase = "player";
  S.score = 1001;
  over();
  assert.equal(S.finalScore, 1001, "no multiplier without a chosen piece");
  console.log("piece select tests passed: choice, HUD multiplier, no promotion or swap, multiplier, submission, pawn path kept");
})();

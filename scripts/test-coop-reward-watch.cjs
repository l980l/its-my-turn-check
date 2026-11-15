"use strict";
const assert = require("node:assert/strict");
const Session = require("../coop-session.js");
const { createGameHarness } = require("./game-harness.cjs");

// While one player picks a reward, the teammate sees the same cards read-only
// and may tap one to recommend it; the chooser sees which card. After the pick
// the watcher keeps the panel briefly with the picked card lit.
const h = createGameHarness({ coop: true, withUpgradeUi: true, withHeldUi: true, seed: 20261023 });
const e = h.context.window.CoopGame, S = h.game.S, ui = h.game.ui;
const sent = [];
e.onInput = (message) => sent.push(message);
const session = Session.create(e, () => {}, () => h.now());
session.start(["queen", "rook"]);
S.enemies = [];
const shown = () => !ui.upgrade.classList.contains("hidden");

// P1 levels up; P2's screen watches.
session.debug("xp", null, 0);
assert.equal(session.flow().phase, "upgrade");
assert.equal(e.pending().slot, 0);
e.present({ view: 1 });
assert.ok(shown(), "the teammate sees the reward panel");
assert.equal(ui.upgradePanel.dataset.watching, "true", "the teammate's panel is read-only");
assert.equal(ui.coopRewardNote.hidden, false);
assert.match(ui.coopRewardNote.textContent, /^P1이 고르는 중/);
assert.equal(ui.choices[0].querySelector("strong").textContent, S.upgradeOptions[0].name, "the watcher sees the chooser's cards");
assert.equal(ui.reroll.disabled, true, "the watcher cannot reroll");

// A tap from the watcher is sent as a recommendation, not a choice.
e.request({ type: "upgrade", index: 1 });
assert.deepEqual(sent.at(-1), { type: "recommend", index: 1, slot: 1 });
assert.equal(session.recommend(0, 1), false, "the chooser does not recommend to themself");
assert.equal(session.recommend(1, 1), true);
assert.equal(ui.choices[1].dataset.recommend, "내 추천");
e.present({ view: 0, interactive: true });
assert.equal(ui.upgradePanel.dataset.watching, undefined, "the chooser's panel stays interactive");
assert.equal(ui.coopRewardNote.hidden, true);
assert.equal(ui.choices[1].dataset.recommend, "P2 추천", "the chooser sees the teammate's pick");
assert.equal(ui.choices[0].dataset.recommend, undefined);
e.request({ type: "upgrade", index: 0 });
assert.deepEqual(sent.at(-1), { type: "upgrade", index: 0, slot: 0 }, "the chooser's own tap is still a choice");

// The recommendation travels in the snapshot, and tapping it again withdraws it.
assert.deepEqual(e.snapshot().recommendation, { slot: 1, index: 1 });
session.recommend(1, 1);
assert.equal(e.recommendation, null);
assert.equal(ui.choices[1].dataset.recommend, undefined);
session.recommend(1, 2);

// The pick clears the recommendation and lights the picked card for the watcher.
e.present({ view: 1 });
h.advance(700);
assert.equal(session.choose(0, 0, "upgrade"), true);
assert.equal(e.recommendation, null, "a choice ends the recommendation");
assert.deepEqual([e.lastChoice.slot, e.lastChoice.index], [0, 0]);
assert.ok(ui.choices[0].classList.contains("coop-picked"), "the watcher sees which card was picked");
assert.ok(shown(), "the panel stays a moment after the pick");
h.advance(1000);
e.present({ view: 1 });
assert.ok(!shown(), "then it closes");
assert.ok(!ui.choices[0].classList.contains("coop-picked"));

// A recommendation is refused outside a reward choice.
assert.equal(session.recommend(1, 0), false);
assert.equal(Session.create(e).recommend(1, 0), false);
console.log("co-op reward watch tests passed: read-only view, recommend, withdraw, snapshot, picked card, guard");

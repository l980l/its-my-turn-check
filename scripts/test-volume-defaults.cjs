const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");

// First launch has no saved volume: both sliders start at 100%, not muted.
// A saved value, including a deliberate 0, is kept.
const storage = (saved) => ({ getItem: (key) => (key in saved ? saved[key] : null), setItem() {} });
const volumes = (saved) => {
  const { ui } = createGameHarness({ localStorage: storage(saved) }).game;
  return [ui.bgmVolumeValue.textContent, ui.sfxVolumeValue.textContent];
};

assert.deepEqual(volumes({}), ["100%", "100%"], "first launch starts at full volume");
assert.deepEqual(volumes({ "checkbeat-bgm-volume-v1": "40", "checkbeat-sfx-volume-v1": "0" }), ["40%", "0%"], "saved volumes are kept, including mute");
assert.deepEqual(volumes({ "checkbeat-volume-v5": "60" }), ["60%", "60%"], "the old single volume key still carries over");
console.log("PASS volume defaults: first launch 100%, saved values and legacy key kept.");

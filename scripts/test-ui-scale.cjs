// UI scale: auto grows with the window from a 1440×900 layout (900×860 inside a
// co-op board frame), manual choices never shrink the zoomed layout below a
// usable size, and the choice is saved and published as --ui-scale.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "ui-scale.js"), "utf8");
function load({ width, height, search = "", saved = null }) {
  const store = new Map(saved === null ? [] : [["its-my-turn-ui-scale-v1", saved]]);
  const props = new Map();
  const events = [];
  const win = {
    innerWidth: width,
    innerHeight: height,
    location: { search },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    document: { documentElement: { style: { setProperty: (k, v) => props.set(k, v) } } },
    addEventListener: () => {},
    dispatchEvent: (e) => events.push(e.type),
    Event: function (type) { this.type = type; },
  };
  vm.runInNewContext(source, { window: win });
  return { UiScale: win.UiScale, store, props, events, win };
}

// Auto mode.
assert.equal(load({ width: 1440, height: 900 }).UiScale.value(), 1, "the design size stays 1:1");
assert.equal(load({ width: 1280, height: 720 }).UiScale.value(), 1, "smaller windows never shrink");
assert.equal(load({ width: 390, height: 844 }).UiScale.value(), 1, "phones stay 1:1");
assert.equal(load({ width: 1920, height: 960 }).UiScale.value(), 1.05, "a full-HD window grows a little");
assert.equal(load({ width: 2560, height: 1300 }).UiScale.value(), 1.45, "a QHD window grows by its height");
assert.equal(load({ width: 3840, height: 2000 }).UiScale.value(), 1.5, "auto stops at 150%");
const qhd = load({ width: 2560, height: 1300 });
assert.equal(qhd.props.get("--ui-scale"), "1.45", "the scale is published as a CSS variable");

// Co-op board frames are about half a window wide, so they use a smaller base.
assert.equal(load({ width: 1270, height: 1200, search: "?coop=1" }).UiScale.value(), 1.4, "a QHD co-op frame grows too");
assert.equal(load({ width: 940, height: 860, search: "?coop=1" }).UiScale.value(), 1, "a full-HD co-op frame stays near 1:1");

// Manual choices.
assert.equal(load({ width: 2560, height: 1300, saved: "1" }).UiScale.value(), 1, "100% turns growth off");
assert.equal(load({ width: 1920, height: 1080, saved: "1.25" }).UiScale.value(), 1.25, "125% applies when it fits");
assert.equal(load({ width: 1920, height: 1000, saved: "1.5" }).UiScale.value(), 1.3, "150% is capped so the layout keeps 1280×760");
assert.equal(load({ width: 1024, height: 700, saved: "1.5" }).UiScale.value(), 1, "small windows ignore a large choice");
assert.equal(load({ width: 2560, height: 1300, saved: "huge" }).UiScale.mode(), "auto", "an unknown saved value falls back to auto");

// Choosing a size saves it, re-applies it and tells the page to re-layout.
const pick = load({ width: 2560, height: 1440 });
pick.UiScale.set("1.25");
assert.equal(pick.store.get("its-my-turn-ui-scale-v1"), "1.25");
assert.equal(pick.UiScale.value(), 1.25);
assert.equal(pick.props.get("--ui-scale"), "1.25");
assert.deepEqual(pick.events, ["resize"], "the page re-measures after a change");
pick.UiScale.set("bogus");
assert.equal(pick.store.get("its-my-turn-ui-scale-v1"), "auto", "invalid choices save as auto");

console.log("ui scale tests passed: auto growth, co-op frames, manual caps, saving");

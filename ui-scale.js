// UI scale for large screens. The board already fills the window, but text and
// panels are sized in CSS px, so on a QHD monitor they look small. Pages zoom
// their HTML layers by --ui-scale; canvas overlays read UiScale.value().
(function (root) {
  const KEY = "its-my-turn-ui-scale-v1";
  const MODES = ["auto", "1", "1.25", "1.5"];
  // Layout the UI was designed for. Embedded co-op views are about half a window wide.
  const embedded = /[?&]coop=1\b/.test(root.location ? root.location.search : "");
  const BASE = embedded ? { w: 900, h: 860 } : { w: 1440, h: 900 };
  const MAX = 1.5;
  let current = 1;

  function readMode() {
    try {
      const saved = root.localStorage.getItem(KEY);
      return MODES.includes(saved) ? saved : "auto";
    } catch (e) {
      return "auto";
    }
  }
  // Auto: grow with the window so a 1440×900 layout keeps its proportions.
  // Manual: never so large that the zoomed layout is smaller than 1280×760 (900×700 embedded).
  function compute(mode, w, h) {
    const fit = Math.min(w / BASE.w, h / BASE.h);
    let scale;
    if (mode === "auto") scale = Math.max(1, Math.min(MAX, fit));
    else {
      const room = Math.min(w / (embedded ? 900 : 1280), h / (embedded ? 700 : 760));
      scale = Math.min(Number(mode), Math.max(1, room));
    }
    return Math.round(scale * 20) / 20;
  }
  function apply() {
    current = compute(readMode(), root.innerWidth || BASE.w, root.innerHeight || BASE.h);
    const doc = root.document && root.document.documentElement;
    if (doc && doc.style) doc.style.setProperty("--ui-scale", String(current));
    return current;
  }
  function set(mode) {
    if (!MODES.includes(mode)) mode = "auto";
    try {
      root.localStorage.setItem(KEY, mode);
    } catch (e) {}
    apply();
    if (root.dispatchEvent && root.Event) root.dispatchEvent(new root.Event("resize"));
  }

  apply();
  if (root.addEventListener) {
    root.addEventListener("resize", apply);
    // Another page of the same game (co-op shell or its board frames) changed the setting.
    root.addEventListener("storage", (event) => {
      if (event.key !== KEY) return;
      apply();
      root.dispatchEvent(new root.Event("resize"));
    });
  }
  root.UiScale = { KEY, MODES, compute, apply, set, mode: readMode, value: () => current };
})(typeof window !== "undefined" ? window : globalThis);

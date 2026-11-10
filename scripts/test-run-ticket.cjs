const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");

// A failed ranking ticket request is retried with backoff while the run lasts.
const timers = [], calls = [];
let failures = 2;
const h = createGameHarness({
  setTimeout: (fn, ms) => timers.push({ fn, ms }),
  fetch: async (url, options) => {
    calls.push(JSON.parse(options.body));
    if (failures-- > 0) throw new Error("offline");
    return { ok: true, json: async () => ({ runId: "run-1", runToken: "token-1" }) };
  },
});
const { S, startVerifiedRun } = h.game;
const settle = () => new Promise((resolve) => setImmediate(resolve));

(async () => {
  h.reset();
  S.running = true;
  startVerifiedRun();
  await settle();
  assert.equal(S.runTicket.failed, true, "the first request fails");
  assert.deepEqual(timers.map((t) => t.ms), [5000], "a retry is scheduled");
  timers.shift().fn();
  await settle();
  assert.deepEqual(timers.map((t) => t.ms), [10000], "the retry backs off");
  timers.shift().fn();
  await settle();
  assert.deepEqual(S.runTicket, { runId: "run-1", runToken: "token-1" }, "a later retry recovers the ticket");
  assert.equal(timers.length, 0, "no retry after success");
  assert.equal(calls.length, 3);

  // A finished run, or a newer run, stops the old retries.
  failures = 1;
  startVerifiedRun();
  await settle();
  S.running = false;
  timers.shift().fn();
  await settle();
  assert.equal(calls.length, 4, "no retry once the run is over");
  failures = 1;
  S.running = true;
  startVerifiedRun();
  await settle();
  const stale = timers.shift();
  startVerifiedRun();
  await settle();
  const before = calls.length;
  stale.fn();
  await settle();
  assert.equal(calls.length, before, "a newer run cancels the old retry");

  console.log("run ticket tests passed: retry with backoff, stop after success, game over or a newer run");
})();

# Trait fusion balance evaluation profile

## Purpose

Compare the saved v0.11.0 trait implementation with the current fusion runtime
under identical, deterministic tactical boards. This evaluator measures combat
rules and progression capacity; it does not measure perceived fun, clarity, or
player adaptation.

## Core loop and hypotheses

- The player moves a chess piece, hits enemies on the destination, and keeps
  the turn after a hit or a durable-enemy hit.
- Tier I should be useful but narrow. A single Tier I should not clear a whole
  tactical board by itself.
- Higher tiers should change targeting patterns and offer build choices without
  turning a single move into an unlimited board clear.
- A durable enemy that survives a hit must not award XP, while the player still
  retains the turn to finish it.
- Boss damage must remain gated by the boss vulnerability state.
- The six-slot progression model must be evaluated separately from tactical
  combat because reward timing and player selections are not simulated by the
  combat policy.

## Fixed simulation inputs

- 32 deterministic tactical layouts, indexed by seed and mirrored orientation.
- Same player start, target landing, enemy placement, durability and boss state
  for baseline/current paired rows.
- One actual `game.js` VM instance per scenario via `scripts/game-harness.cjs`.
- Player action: choose the designated legal destination. No autoplay policy or
  network/leaderboard calls participate.

## Metrics

Each raw row records direct kills, collateral kills, total hits, total damage,
XP gained, whether the player retained the turn, legal mobility before/after
the move, boss HP delta and boss damage gating. Aggregate rates always retain
their scenario denominator.

The progression model records trait offers, fusions, occupied slots and bag
pressure under explicit simplified assumptions. A capped model result is not a
claim that a 15-minute build is impossible.

## Decision bands

- Flag a trait when its matched mean collateral kills exceed 2.0 on the compact
  tactical boards, or when it repeatedly removes every non-boss enemy.
- Flag boss-gating or durable-XP failures as correctness failures, independent
  of averages.
- Treat a material delta from the baseline as an investigation signal. It does
  not by itself establish a fun or difficulty conclusion.

## Limits

The layouts are authored tactical samples, not player populations. They omit
camera readability, reaction time, UI friction, long-horizon enemy spawning and
human build choices. Playtesting remains necessary before tuning claims about
enjoyment or overall difficulty.

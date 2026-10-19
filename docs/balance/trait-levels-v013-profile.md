# Trait-level balance evaluation profile (v0.13)

## Purpose

Evaluate the six-slot, five-level trait structure with deterministic evidence.
This profile checks rule-level progression capacity and bounded tactical effects;
it does not claim to measure fun, match duration, player skill, or live survival
rate.

## Core loop and hypotheses

- A run selects up to six distinct traits. Once all six slots are occupied,
  subsequent trait rewards upgrade an owned trait instead of adding hidden
  inventory.
- The current pool contains 13 distinct traits: the original 10 choices plus
  the retained advanced patterns **ORBIT STRIKE**, **FAN BLADE**, and
  **CROSS FORK**. There are no tier/evolution recipes or material bag paths.
- `MAX_LEVEL` is five. A full build therefore needs exactly 30 trait rewards:
  six acquisitions and 24 upgrades.
- The offer API must produce a legal acquisition before six slots and a legal
  non-maxed upgrade after six slots. The game provides at most two rerolls per
  run; rerolls are not assumed to create progression that the base offer cannot.
- Level growth should remain bounded. Each individual level-up changes one
  meaningful dimension: attack traits alternate target capacity and, where
  needed, range; XP traits improve cadence; escape traits reduce cooldown; and
  movement traits extend sparse movement values. Traits must not inherit or
  stack unrelated former fusion effects.
- A movement rule's scalar growth is not automatically a new legal destination
  for every chess piece. `royal` movement can overlap a king or queen's native
  geometry, and a stride can overlap another movement modifier. The evaluator
  records rule outputs only; real piece/build geometry still needs integration
  coverage and player-facing clarity checks.
- Piece selection remains an optional fork every five ranks. The evaluator
  deliberately selects the trait route so it can measure the 30-reward trait
  contract without inventing a real-time pacing estimate.

## Fixed inputs and metric contract

- **Draft unit:** one seeded, deterministic 30-trait-choice run after the
  initial piece choice. The policy fills empty slots first, then picks the
  lowest-level legal offered trait; it is not a player or optimal-build model.
- **Draft metrics:** completed full builds / 96 runs, total equipped levels out
  of 30, rerolls spent, no-op selections, unusable offers before reroll, and
  trajectory/final-state hashes. Seed changes that lead to identical hashes are
  reported as aliases, not independent evidence.
- **Tactical unit:** the same trait at Lv1 and Lv5 on one of 20 authored,
  deterministic compact boards. Each probe performs two direct-kill resolves
  on waves 10 and 11 with shared memory, then records secondary targets, XP,
  activation and movement output. This specifically exposes cooldown behavior
  while calling the shared `TraitSystem` API.
- **Rule fingerprint:** evaluator and `traits.js` SHA-256 hashes plus dirty-tree
  status are stored in the raw artifact.

## Decision bands and action

- Any no-op reward before 30 choices, or a failed six-Lv5 completion, is a
  progression defect to investigate in `offer`, not proof that players cannot
  finish a build.
- More than 10 secondary targets across the two compact probes at Lv5 signals
  possible excessive target growth and requires review before tuning. It does
  not measure whole-map clears.
- A regression in API validity or a missing trait is a correctness failure.
- If all checks pass, retain the values and validate actual pacing, difficulty,
  UI understanding, and build diversity through instrumented playtests rather
  than treating the simulator as a fun score.

## Explicit limits

This profile omits XP/minute, enemy spawns, bosses, death, autoplay behavior,
reroll strategy, input time, camera readability, and player preference. A
30-choice full build is an offer-count contract only; it is not a claim about
minutes required in a real game.

# Trait balance simulation (v0.12.0)

Generated with fixed seed 20261016. The source tree was dirty when evaluated. These are deterministic tactical samples, not independent player samples or a fun score.

## Coverage

- 32 authored boards; 29 canonical unique board states. Rotated layouts share tactical structure and are reported as deterministic coverage, not independent samples.
- 32 workloads: all 28 individual traits plus four six-trait tier sets.
- 1024 paired current rows and 1024 paired baseline rows.

## Current rule observations

| Tier | Baseline mean collateral | Current mean collateral | Current mean damage | Current mean XP |
|---|---:|---:|---:|---:|
| T1 | 1.263 | 0.25 | 1.338 | 1.109 |
| T2 | 1.323 | 0.672 | 1.953 | 1.516 |
| T3 | 2.438 | 0.729 | 1.948 | 1.599 |
| T4 | 2.438 | 1.26 | 2.438 | 2.104 |

Tier I single-trait maximum collateral kills on any matched board: **1**. All 1024 selected destinations were legal: **true**.

Current correctness checks: durable zero-kill XP violations **0**, durable turn-retention failures **0**, sealed-boss damage violations **0**, vulnerable-boss damage failures **0**.

Matched aggregate deltas versus v0.11.0: direct kills 0, collateral kills -1.337, damage -1.614, XP -1.662, retained-turn rate 0.

## 15-minute progression model

The primary finite model assumes 24 trait offers and 5 fusion kits over 15 minutes, uses the runtime reward-pool and recipe APIs, six equipped slots plus the eight-item material bag, and greedily selects among three offers. It does not use measured XP/minute, boss-kill rate, or human choice data.

| Hypothetical offers in 15 min | Fusion kits | Mean T4 | Max T4 | Six-T4 drafts |
|---:|---:|---:|---:|---:|
| 24 | 5 | 1.375 | 3 | 0/64 |
| 36 | 8 | 2.266 | 4 | 0/64 |
| 48 | 11 | 2.891 | 5 | 0/64 |
| 64 | 15 | 3.547 | 5 | 0/64 |

The primary model did not produce a six-T4 result. That is evidence to investigate reward timing, kit frequency, bag pressure, or recipe overlap; it is not proof that the target is impossible.

## Conditional time to six distinct equipped T4 traits

Using the same seeds, capped at 160 offers: 28/64 completed, 36/64 censored. At the assumed 1.6 offers/minute, fastest 41.25 min, median among completed 71.25 min, slowest completed 96.25 min. This is a draft-model conversion, NOT measured gameplay time. The policy skips duplicate T4 recipes and equips highest-tier traits at a kit; it is greedy, not optimal. XP escalation, actual boss cadence, death, and input time are omitted.

## Limits

The evaluator uses shipping move/damage code in a VM, but it does not simulate player skill, long-horizon enemy spawn pressure, UI readability, or co-op. Validate tuning decisions with playtests after rule-level regressions are clear.

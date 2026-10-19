# Trait level balance evaluation (v0.13.0)

Generated from fixed seed 20261017. The source tree was dirty when evaluated. This is deterministic rule evidence, not a claim about player enjoyment, survival odds, or real match duration.

## Evaluation profile

- **Loop:** choose six traits, then improve their levels through the same reward offers.
- **Hypotheses:** each trait progresses from Lv1 to Lv5 without unbounded target/cooldown/pattern stacking; 30 trait rewards can fill six Lv5 slots; two rerolls only repair unusable offers.
- **Fixed inputs:** 96 seeded drafts, 30 trait choices each (the initial piece choice is excluded), at most 2 rerolls, 20 tactical boards, direct-kill contexts and shared pure TraitSystem rules. At every five ranks, the optional piece/trait fork is held to the trait route, so this does not predict real elapsed time.
- **Decision bands:** report any failed 30-choice completion, no-op offer, or Lv5 board result above 10 total secondary targets over two immediate probes. Such a flag is an investigation signal, not automatic retuning.

## Draft progression

| Metric | Result |
|---|---:|
| Completed six Lv5 builds | 96/96 |
| Mean total equipped levels | 30/30 |
| P50 / P95 rerolls spent | 0 / 0 |
| No-op selections | 0 |
| Unusable pre-reroll offers | 0 |
| Unique trajectories / final states | 96 / 50 |

A completed build needs exactly 30 trait rewards: six first picks plus four upgrades for each occupied slot. The simulation applies the offered options using a deterministic fill-first, then lowest-level policy. It is neither optimal nor a player model. The reroll quota is capped at two and is only spent when an offer has no legal acquisition or upgrade.

## Level monotonicity

All 13 traits were checked at every level, not only at the Lv1/Lv5 endpoints. **0** violate their configured monotone direction (attack and movement non-decreasing; XP cadence and escape cooldown non-increasing). **0** have an intermediate level with no scalar increase or newly targetable coordinate.

| Growth axis | Lv1 → Lv5 scalar sequence | Traits |
|---|---|---:|
| attack | r1/t1 → r1/t2 → r1/t3 → r1/t4 → r1/t5; r1/t1 → r1/t2 → r2/t2 → r2/t3 → r2/t4; r2/t1 → r2/t2 → r3/t2 → r3/t3 → r4/t3; r2/t1 → r2/t2 → r2/t3 → r2/t4 → r2/t5; r3/t1 → r3/t2 → r3/t3 → r3/t4 → r3/t5 | 9 |
| xp | 8 → 6 → 5 → 4 → 3 | 1 |
| escape | 8 → 7 → 6 → 5 → 4 | 1 |
| movement | 1 → 2 → 3 → 4 → 5 | 2 |

No monotonicity failure was observed in the shared rules.
Each checked level-up changed a scalar value or expanded the single-targetable geometry used by this probe.

## Paired tactical probes

Each row compares the same trait and board at Lv1 and Lv5. A probe performs a direct-kill resolve on wave 10 and a second resolve on wave 11 with shared memory; this exposes cooldown behavior without simulating a full match. There are 260 paired rows across 20 canonical board states.

| Trait | Growth axis | Lv1 rule | Lv5 rule | Lv1 mean targets | Lv5 mean targets | Lv5 max targets | Mobility Δ |
|---|---|---|---|---:|---:|---:|---:|
| CROSS FORK (circuitSovereign) | attack | range 2 / targets 1 | range 2 / targets 5 | 2 | 10 | 10 | 0 |
| FAN BLADE (echoMonarch) | attack | range 3 / targets 1 | range 3 / targets 5 | 2 | 10 | 10 | 0 |
| FORK (fork) | attack | range 2 / targets 1 | range 2 / targets 5 | 2 | 9.8 | 10 | 0 |
| ARC MAGNET (magnet) | attack | range 1 / targets 1 | range 1 / targets 5 | 2 | 9.9 | 10 | 0 |
| IMPACT CORE (shockwave) | attack | range 1 / targets 1 | range 1 / targets 5 | 1.3 | 6.5 | 10 | 0 |
| CROSS CHECK (crossCheck) | attack | range 1 / targets 1 | range 2 / targets 4 | 2 | 7.7 | 8 | 0 |
| DIAGONAL BURST (diagonalBurst) | attack | range 1 / targets 1 | range 2 / targets 4 | 2 | 8 | 8 | 0 |
| ECHO BLADE (echoBlade) | attack | range 2 / targets 1 | range 4 / targets 3 | 1.9 | 3.7 | 6 | 0 |
| ORBIT STRIKE (astralCrown) | attack | range 2 / targets 1 | range 2 / targets 5 | 1 | 5 | 5 | 0 |
| CHAIN SPARK (chainSpark) | xp | every 8 kills | every 3 kills | 0 | 0 | 0 | 0 |
| LONG STRIDE (longStride) | movement | stride +1 | stride +2 / royal +3 | 0 | 0 | 0 | 4 |
| ROYAL STEP (royalStep) | movement | royal +1 | stride +2 / royal +3 | 0 | 0 | 0 | 4 |
| SLIPSTREAM (slipstream) | escape | cooldown 8 | cooldown 4 | 0 | 0 | 0 | 0 |

**Strongest observed probe:** echoMonarch reached 10 total secondary targets at Lv5 across its two fixed resolves (Lv1 mean 2, Lv5 mean 10). This is a compact-board signal, not an estimate of full-board clears.

No Lv5 tactical row exceeded the 10-target two-probe decision band.

## Limits

- No real XP/minute, enemy pressure, death rate, autoplay policy, boss cadence, UI comprehension, or player preference is measured. In particular, this report does **not** convert 30 rewards into minutes.
- Movement scalar growth is not guaranteed to add a legal destination for every piece or build: royal movement can overlap native king/queen geometry, and stride can overlap another movement modifier. This pure-rule probe records movement output, not the complete game move set.
- Seeded draft trajectories are reproducible samples, not independent player populations. 0 draft records alias an earlier trajectory, and 46 alias an earlier final state.
- The tactical layouts are compact authored stress boards. A successful bounded probe does not prove the live game is balanced; player playtests remain the next evidence source.

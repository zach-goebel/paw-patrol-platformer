# Plan: Stage 3 Humdinger — 3 Hits + Hit Feedback

## Enhancement Summary

**Deepened on:** 2026-03-11
**Sections enhanced:** 4
**Research agents used:** best-practices-researcher, julik-frontend-races-reviewer, performance-oracle, spec-flow-analyzer, framework-docs-researcher, architecture-strategist, pattern-recognition-specialist, Context7 (Phaser API docs)

### Key Improvements
1. Confirmed root cause: overlap fires per-pair per physics step — multiple nets in flight cause multi-hit in single frame
2. Discovered timer leak: `bossCycle()` orphans previous cycle's timers (approach, tired, recover)
3. Found 3 additional gaps: `bossHitPlayer()` missing `hit-stun` guard, boss Y-tracking stops during stun, timers not pushed to `pendingTimers`

### New Considerations Discovered
- Use Phaser's `processCallback` (4th arg to `physics.add.overlap`) for more efficient guarding
- Disable boss body during hit-stun to prevent any overlap detection
- Initialize `bossHitRegistered` in `init()` for pattern consistency

---

## Problem

1. **Humdinger dies in one hit on Stage 3** — should require exactly 3 hits, only registering during vulnerability (flash) windows.
2. **No clear hit feedback** — player can't distinguish a successful hit from the normal flash cycle.

## Analysis

The config already sets `bossHP: 3` for stage 3 (`constants.js:204`), and `hitBossWithNet()` (`GameScene.js:471-496`) decrements `bossHitsRemaining` and calls `bossCycle()` for subsequent rounds. The shrink-per-hit logic exists at line 492. However, the user reports single-hit kills, suggesting either:

- A race condition where the overlap fires multiple times before `bossState` transitions away from `'vulnerable'`
- The vulnerability flash tween or recovery timer interfering with state

### Research Insights: Root Cause Confirmed

**From races reviewer:** The overlap callback at line 330 fires once per overlapping pair per physics step. The net pool (`maxSize: 4`) means up to 4 nets could overlap the boss simultaneously. In the current code, `hitBossWithNet()` calls `endBossVulnerability()` then `bossCycle()` synchronously — so `bossState` does transition to `'approaching'` within the same call stack, which *narrowly* prevents the second net's callback from registering. However, this is fragile and breaks as soon as any async delay is introduced (like the planned 500ms pause).

**From framework docs researcher:** Phaser's arcade physics overlap CAN fire multiple callbacks in the same physics step for different group members overlapping the same target. The `processCallback` (4th argument to `physics.add.overlap`) is the most efficient guard — it short-circuits before the overlap callback runs. Use it in addition to state checks.

**From performance oracle:** Each `bossCycle()` call creates new timers without cleaning up the previous cycle's timers. The old `bossApproachTimer` reference is overwritten (orphaned), and stale tired/recovery timers remain live. With 3 hits, this means 2 orphaned approach timers firing every 50ms (no-opping via state guard) and potentially 2 stale recovery timers that could fire unexpectedly.

---

## Fix: Four changes in `GameScene.js`

### Change 1: Guard against multi-hit per window

Add a `bossHitRegistered` flag (named to match `exitReached`/`skyeReached` convention). Set `true` on hit, checked before processing. Reset at the start of each vulnerability window.

**In `init()` (~line 33)**, initialize alongside other boss state:
```js
this.bossHitRegistered = false;
```

**In `bossCycle()` (line 363)**, when entering vulnerable state (~line 391):
```js
this.bossHitRegistered = false;  // allow one hit this window
```

**In the net-boss overlap callback (line 330)**, use `processCallback` for efficient guarding:
```js
// Replace current overlap setup:
this.netBossOverlap = this.physics.add.overlap(
    this.nets,
    this.boss,
    // overlapCallback
    (net, boss) => {
        net.setActive(false).setVisible(false);
        net.body.enable = false;
        this.hitBossWithNet();
    },
    // processCallback — return false to skip overlap entirely
    (net, boss) => {
        if (!net.active) return false;
        if (this.bossState !== 'vulnerable' || this.bossHitRegistered) {
            // Bounce off: reverse net, grey flash
            net.setVelocityX(-net.body.velocity.x);
            net.originX = net.x;
            if (this.boss && this.boss.active) {
                this.boss.setTint(0xaaaaaa);
                this.time.delayedCall(150, () => {
                    if (this.boss && this.boss.active && this.bossState !== 'vulnerable') {
                        this.boss.clearTint();
                    }
                });
            }
            return false;
        }
        return true;
    },
    this
);
```

**In `hitBossWithNet()` (line 471)**, set flag and state immediately:
```js
if (this.bossState !== 'vulnerable' || this.bossHitRegistered) return;
this.bossHitRegistered = true;
this.bossState = 'hit-stun'; // prevent re-entry — MUST be set before any async work
```

#### Research Insights

**Best Practices:**
- The `processCallback` approach is more performant than checking inside the overlap callback — it prevents the overlap callback from running at all
- Setting `bossState = 'hit-stun'` immediately (before any async work) is the single most important line — it prevents the next physics step from triggering another hit
- The `bossHitRegistered` flag is belt-and-suspenders with `hit-stun` state, but protects against future code changes that might inadvertently modify the state machine

**Edge Cases:**
- Two nets hitting boss in same physics frame: `processCallback` returns `true` for first, `false` for second (because `bossHitRegistered` is now `true`)
- Net hits boss exactly as vulnerability window times out: the 3-second recovery timer fires and calls `endBossVulnerability()` + `bossCycle()`, but `hitBossWithNet()` has already set state to `'hit-stun'`, so `bossCycle()` returns early via `if (this.bossState === 'defeated') return;` — **wait, this is a gap**: `bossCycle` only checks for `'defeated'`, not `'hit-stun'`. Fix: change guard to `if (this.bossState === 'defeated' || this.bossState === 'hit-stun') return;`

### Change 2: Distinct hit feedback (separate from flash cycle)

Currently a hit does: red tint for 200ms + camera shake. The vulnerability cycle does: yellow tint + alpha pulse. These are too similar.

Replace the hit feedback with a multi-step sequence that's unmistakably different:

1. **Immediate**: Boss turns bright red, camera shake (stronger: 0.01 instead of 0.005), boss body disabled
2. **At 200ms**: Boss briefly turns white (0xffffff) — a classic "damage flash"
3. **At 400ms**: Boss clears tint, shrinks with bounce tween, body re-enabled
4. **Show remaining hits text**: Float a "2 MORE HITS!" / "1 MORE HIT!" message above boss, fading out over 1.5s
5. **Boss briefly pauses** (500ms delay before `bossCycle()`) so the player sees the feedback

**Scale values per hit** (3-hit boss):
- After hit 1: scale 0.85
- After hit 2: scale 0.70
- After hit 3: defeated (spin + fly away)

**Implementation in `hitBossWithNet()`:**
```js
hitBossWithNet() {
    if (this.bossState !== 'vulnerable' || this.bossHitRegistered) return;
    this.bossHitRegistered = true;
    this.bossState = 'hit-stun'; // MUST be first — prevents re-entry

    const sfx = this.registry.get('sfx');
    if (sfx) sfx.play('boss-hit');

    this.bossHitsRemaining--;
    this.endBossVulnerability();

    // Disable boss body during hit-stun to prevent any overlap detection
    if (this.boss.body) this.boss.body.enable = false;

    // Step 1: Red flash + strong shake
    this.boss.setTint(0xff0000);
    this.cameras.main.shake(300, 0.01);

    // Step 2: White flash at 200ms
    const t1 = this.time.delayedCall(200, () => {
        if (!this.boss || !this.boss.active) return;
        this.boss.setTint(0xffffff);
    });
    this.pendingTimers.push(t1);

    // Step 3: Clear tint + shrink at 400ms
    const t2 = this.time.delayedCall(400, () => {
        if (!this.boss || !this.boss.active) return;
        this.boss.clearTint();

        // Re-enable boss body
        if (this.boss.body) this.boss.body.enable = true;

        if (this.bossHitsRemaining <= 0) {
            this.bossDefeated();
        } else {
            // Shrink with bounce
            const newScale = 1 - (this.bossHP - this.bossHitsRemaining) * 0.15;
            this.tweens.add({
                targets: this.boss,
                scale: Math.max(0.4, newScale),
                duration: 300,
                ease: 'Back.easeOut',
            });

            // Show remaining hits
            const hitsText = this.bossHitsRemaining === 1 ? '1 MORE HIT!' : `${this.bossHitsRemaining} MORE HITS!`;
            const label = this.add.text(this.boss.x, this.boss.y - 70, hitsText, {
                fontSize: '20px', fill: '#ff4444', fontFamily: 'monospace',
                fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
            }).setOrigin(0.5).setDepth(50);

            this.tweens.add({
                targets: label,
                y: label.y - 30, alpha: 0,
                duration: 1500, ease: 'Power2',
                onComplete: () => label.destroy(),
            });

            // Brief pause then restart cycle
            const t3 = this.time.delayedCall(500, () => {
                if (this.bossState === 'defeated' || this.bossState !== 'hit-stun') return;
                this.bossCycle();
            });
            this.pendingTimers.push(t3);
        }
    });
    this.pendingTimers.push(t2);
}
```

#### Research Insights

**Best Practices (game juice for toddlers):**
- Red → white → clear is a classic arcade damage sequence (Mega Man, Kirby) — instantly recognizable even to very young players
- `Back.easeOut` on the shrink creates a satisfying "squish" effect
- Floating text feedback is critical for parents watching — they can track progress even if the toddler doesn't read
- Camera shake at 0.01 intensity is strong enough to feel impactful but not disorienting

**Performance Considerations:**
- Disabling boss body during hit-stun eliminates all overlap/collider processing for the boss sprite during that window
- Floating text `label` is created and destroyed — minimal GC pressure for a once-per-hit event
- All `delayedCall` timers pushed to `pendingTimers` for cleanup on scene restart

### Change 3: Fix `bossHitPlayer()` guard (discovered by agents)

The `bossHitPlayer()` method at line 435 currently guards against `'defeated'` and `'vulnerable'` states but NOT `'hit-stun'`. During the hit-stun animation, the boss is stationary — a player standing on/near the boss would take contact damage. This is wrong: a stunned boss should not deal damage.

**In `bossHitPlayer()` (line 435):**
```js
// Current:
if (this.bossState === 'defeated' || this.bossState === 'vulnerable') return;
// Change to:
if (this.bossState === 'defeated' || this.bossState === 'vulnerable' || this.bossState === 'hit-stun') return;
```

### Change 4: Clean up previous cycle timers in `bossCycle()` (discovered by agents)

Each `bossCycle()` call creates new timers without cleaning up the previous cycle's. This orphans timers that continue firing (no-opping via state guards, but still a resource leak). After 3 hits: 2 orphaned approach timers firing every 50ms + potentially 2 stale recovery timers.

**In `bossCycle()` (line 363)**, add cleanup at the top:
```js
bossCycle() {
    if (this.bossState === 'defeated' || this.bossState === 'hit-stun') return;

    // Clean up timers from previous cycle
    if (this.bossApproachTimer) {
        this.bossApproachTimer.remove(false);
        this.bossApproachTimer = null;
    }
    if (this._tiredTimer) {
        this._tiredTimer.remove(false);
        this._tiredTimer = null;
    }
    if (this._recoverTimer) {
        this._recoverTimer.remove(false);
        this._recoverTimer = null;
    }

    this.bossState = 'approaching';
    // ... rest of method, but store named references:
    // this._tiredTimer = this.time.delayedCall(tiredDelay, () => { ... });
    // this._recoverTimer = this.time.delayedCall(3000, () => { ... });
}
```

**Also update the timer assignments** in the tired/recovery section to use named references instead of anonymous `const`:
```js
// Replace:
const tiredTimer = this.time.delayedCall(tiredDelay, () => { ... });
this.pendingTimers.push(tiredTimer);
// With:
this._tiredTimer = this.time.delayedCall(tiredDelay, () => { ... });
this.pendingTimers.push(this._tiredTimer);

// And inside the tired callback, for the recovery timer:
this._recoverTimer = this.time.delayedCall(3000, () => { ... });
this.pendingTimers.push(this._recoverTimer);
```

#### Research Insights

**Performance:**
- Without cleanup, 2 orphaned `time.addEvent` timers fire every 50ms for the rest of the boss fight — each one runs a callback that checks `bossState !== 'approaching'` and returns. This is ~40 no-op callbacks/second of wasted work
- Explicit cleanup eliminates zombie timers entirely

---

## Boss State Machine (Complete)

| State | Description | Can Take Damage | Deals Contact Damage | Y-Tracking | Transitions To |
|-------|-------------|-----------------|---------------------|------------|----------------|
| `inactive` | Boss not yet created | No | No | No | `waiting` |
| `waiting` | Boss exists, fight not triggered | No | No | No | `approaching` |
| `approaching` | Chasing player (2.5s) | No | Yes | Yes | `vulnerable` |
| `vulnerable` | Tired, flashing yellow (3s) | **Yes** | No | Yes | `hit-stun`, `approaching` (timeout) |
| `hit-stun` | Just took damage (0.5s) | No | No | **Hold position** | `approaching` (next cycle), `defeated` |
| `defeated` | Terminal state | No | No | No | — |

### Research Insights

**Edge Cases Identified by Agents:**
- **Player dies during hit-stun**: `restartLevel()` calls `cancelAllTimers()` + `cleanup()` which kills all tweens and timers. Safe.
- **Player stomps boss**: No stomp detection exists for the boss — `playerEnemyCollision` only handles kitties. Boss contact only triggers `bossHitPlayer()`. This is correct for the current design.
- **Net hits as vulnerability ends**: The recovery timer calls `bossCycle()` which now checks for `hit-stun` and returns early. The `bossHitRegistered` flag + immediate state transition prevents any conflict.
- **Mini-boss (stages 1 & 2)**: `bossHP: 1`, so `bossHitsRemaining` goes to 0 on first hit → `bossDefeated()` runs immediately. The shrink/pause logic is skipped. No behavioral change for mini-bosses.

---

## Files Changed

- `src/scenes/GameScene.js`:
  - `init()` — add `this.bossHitRegistered = false`
  - `createBoss()` — rewrite net-boss overlap to use `processCallback`
  - `bossCycle()` — add `hit-stun` guard + timer cleanup at top + named timer references
  - `hitBossWithNet()` — complete rewrite with `hit-stun` state + multi-step feedback + `pendingTimers` push
  - `bossHitPlayer()` — add `hit-stun` to state guard
  - `update()` boss Y-tracking — boss holds Y position during `hit-stun` (no change needed — existing check already excludes `hit-stun`)

## No Changes Needed

- `constants.js` — `bossHP: 3` is already correct for stage 3
- Other scenes — unaffected

## Risk

- Low — changes are scoped to boss hit processing only
- Three-layer defense against double-hits: `processCallback` guard → `bossHitRegistered` flag → `bossState = 'hit-stun'`
- Timer cleanup eliminates existing leak pattern
- All new timers pushed to `pendingTimers` for scene restart safety
- Mini-boss behavior unchanged (1 hit → immediate defeat, no shrink/pause)

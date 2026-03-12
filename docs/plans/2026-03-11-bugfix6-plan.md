# Plan: Bug Fix 6 — Boss 2-Hit Kill + Skye Cage Not Opening

## Bug 1: Stage 3 Humdinger Dying in 2 Hits Instead of 3

### Root Cause

When a net hits the boss during the non-vulnerable (approaching) state, the `processCallback` in `createBoss()` **bounces the net** by reversing its velocity and resetting `net.originX = net.x` (line 348). This resets the net's distance counter, keeping it alive. The net ping-pongs inside the boss's hitbox indefinitely.

When the boss transitions to `'vulnerable'` (after the approach timer fires), the `processCallback` now sees `bossState === 'vulnerable' && !bossHitRegistered` → `true`. The stuck net auto-registers as a **phantom hit** without the player doing anything.

Result: player fires 2 nets, but 3 hits register (1 phantom + 2 real), or 1 phantom + 1 real = boss dies on what looks like the 2nd hit.

**Evidence chain:**
- `processCallback` at line 341-358: bounces net, resets `originX`
- `update()` distance check at line 987: `Math.abs(net.x - net.originX) >= NET_MAX_DISTANCE` — origin was reset, so distance resets too
- `bossCycle()` tired callback at line 414-415: sets `bossState = 'vulnerable'` and `bossHitRegistered = false`
- Net is still alive near boss → processCallback returns `true` → overlap callback fires → `hitBossWithNet()` → phantom hit

### Fix

**In the `processCallback` (line 341-358):** Deactivate the net on bounce instead of reversing it. The visual "bounce off" effect is not worth the ping-pong bug.

```js
// processCallback — guards against multi-hit and handles bounce-off
(net) => {
    if (!net.active) return false;
    if (this.bossState === 'vulnerable' && !this.bossHitRegistered) {
        return true; // allow hit
    }
    // Net hit non-vulnerable boss — deactivate it
    net.setActive(false).setVisible(false);
    net.body.enable = false;
    // Grey flash on boss to show the net hit but didn't damage
    if (this.boss && this.boss.active) {
        this.boss.setTint(0xaaaaaa);
        this.time.delayedCall(150, () => {
            if (this.boss && this.boss.active && this.bossState !== 'vulnerable') {
                this.boss.clearTint();
            }
        });
    }
    return false;
},
```

**Changes:**
- Remove `net.setVelocityX(-net.body.velocity.x)` — no more bounce
- Remove `net.originX = net.x` — no more origin reset
- Add `net.setActive(false).setVisible(false); net.body.enable = false;` — kill the net immediately
- Keep the grey flash visual feedback (boss briefly flashes grey to show net was blocked)

---

## Bug 2: Skye Not Released from Cage After Humdinger Defeated

### Root Cause

Stage 3 layout in `constants.js`:
- `bossX: 2000` → boss barrier at `bossX + 150 = 2150`
- `exitX: 2200` → exit zone at x=2200
- Skye at `bossX + 300 = 2300`

After the boss is defeated, the barrier at x=2150 is destroyed (line 602). The player walks right and hits the **exit zone at x=2200 first**, before reaching Skye at x=2300.

`reachExit()` (line 867):
1. Checks `this.levelData.hasBoss && this.bossState !== 'defeated'` → boss IS defeated, passes
2. Checks `nextLevel >= LEVELS.length` → `3 >= 3` is true
3. Transitions directly to `VictoryScene`, **bypassing the Skye rescue sequence entirely**

The cage open animation (600ms delay in `bossDefeated()`), the Skye overlap zone, the bouncing arrow — none of it matters because the exit zone triggers first.

### Fix

**In `reachExit()` (line 867):** Add a guard that blocks the exit when the level has a Skye rescue sequence that hasn't been completed.

```js
reachExit() {
    if (this.exitReached || this.isTransitioning) return;

    // Block exit if boss is alive
    if (this.levelData.hasBoss && this.bossState !== 'defeated') return;

    // Block exit if Skye rescue hasn't happened yet
    if (this.levelData.hasSkye && !this.skyeReached) return;

    this.exitReached = true;
    // ... rest unchanged
}
```

This single line — `if (this.levelData.hasSkye && !this.skyeReached) return;` — ensures the player must complete the Skye rescue sequence before the exit activates. The Skye sequence ends by transitioning to VictoryScene directly (via `onReachSkye()`), so the exit zone is effectively a no-op for stage 3 but remains functional for stages 1 and 2.

---

## Files Changed

- `src/scenes/GameScene.js`:
  - `createBoss()` processCallback: deactivate net instead of bouncing (fixes Bug 1)
  - `reachExit()`: add `hasSkye && !skyeReached` guard (fixes Bug 2)

## Risk

- **Low** — Both changes are single-point guards
- Bug 1 fix: nets that hit a non-vulnerable boss disappear (cleaner than bouncing, eliminates ping-pong entirely)
- Bug 2 fix: exit zone blocked until Skye rescue complete (only affects stage 3, stages 1-2 have `hasSkye: false`)
- Mini-boss behavior unchanged (stages 1-2 have `miniBoss: true`, `hasSkye: false`)

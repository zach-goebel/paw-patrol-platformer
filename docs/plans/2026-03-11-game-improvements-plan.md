# Paw Patrol Platformer — Game Improvements Plan

**Created:** 2026-03-11
**Deepened:** 2026-03-11
**Status:** Ready for Implementation
**Tech:** Phaser.js 3.90.0 (ES6 modules, Vite 7.3.1)

## Enhancement Summary

**Research agents used:** 7 (projectile best practices, boss fight patterns, touch/polish patterns, performance oracle, architecture strategist, pattern recognition, race condition reviewer)

### Key Improvements from Research
1. **Object pool for net projectiles** — Use Phaser physics group with `classType` and `maxSize` instead of create/destroy per shot. Single persistent overlap collider instead of per-projectile colliders.
2. **Frame-rate-independent boss Y-tracking** — Move lerp to `update()` with delta-corrected interpolation instead of 50ms timer.
3. **Treat flickering root cause found** — Use `body.setDirectControl(true)` (Phaser 3.70+) to let tweens control position without physics conflict.
4. **Enemy patrol root cause found** — The `enemies-vs-platforms` collider zeros velocity each frame. Remove it or add velocity recovery.
5. **Critical race conditions identified** — 11 timing issues found; fixes include `cinematicMode` flag, `isTransitioning` guard, mark-and-sweep for projectiles, and `tweens.killAll()` in cleanup.

### Existing Bugs Discovered (Pre-Plan)
- Line 419: Boss tint-clear timer not tracked in `pendingTimers`
- `cleanup()` does not kill active tweens — tween callbacks can fire on stale scene references
- Boss vulnerability tween leaks if boss defeated while vulnerable (two tweens fight over alpha)

---

## Overview

13 gameplay, UI, and polish improvements to the Paw Patrol platformer. Changes range from core mechanic replacements (net attack) to bug fixes (treat flickering) and UX improvements (mobile detection).

## Execution Order (Dependency-Aware)

| Step | Change | Description | Files |
|------|--------|-------------|-------|
| 0 | Pre-work | Add safety infrastructure (cinematicMode, isTransitioning, cleanup fixes) | GameScene.js |
| 1 | #1 | Net attack (replaces paw) | constants.js, PreloadScene.js, GameScene.js, SFX.js |
| 2 | #6 | Boss Y-tracking (follows Chase's ground level) | GameScene.js |
| 3 | #2 | Mini-boss for stages 1 & 2 (single-hit chase-away) | constants.js, GameScene.js |
| 4 | #8 | Kitty hitbox reduction | GameScene.js |
| 5 | #9 | Kitty patrol fix (wider ranges, faster speed) | constants.js, GameScene.js |
| 6 | #12 | Kitty counter HUD | GameState.js, UIScene.js, GameScene.js |
| 7 | #5 | Story screen (new StoryScene) | NEW StoryScene.js, main.js, TutorialScene.js, MenuScene.js |
| 8 | #7 | Stage transition arrow | PreloadScene.js, GameScene.js |
| 9 | #4 | End sequence (walk to cage) | GameScene.js |
| 10 | #13 | Instruction text updates | TutorialScene.js, UIScene.js, GameScene.js |
| 11 | #10 | Touch controls only on touch devices | GameScene.js |
| 12 | #11 | Treat bugs (flickering + below-surface) | GameScene.js, constants.js |
| 13 | #3 | Verify stage 3 boss unchanged | Testing only |

---

## Step 0: Pre-Work — Safety Infrastructure

Before any feature work, fix foundational issues that multiple changes depend on.

### 0a. Add `cinematicMode` and `isTransitioning` flags

```js
// In init():
this.cinematicMode = false;   // blocks damage + input during end sequence
this.isTransitioning = false;  // blocks damage during scene transitions
```

Guard all damage processing:
```js
// In hitEnemy() and bossHitPlayer():
if (this.isInvincible || this.cinematicMode || this.isTransitioning) return;
```

Guard `restartLevel()`:
```js
restartLevel() {
  if (this.isTransitioning) return;
  this.isTransitioning = true;
  this.cancelAllTimers();  // kill timers IMMEDIATELY, not just in cleanup
  // ... existing restart logic
}
```

Set `isTransitioning = true` in `reachExit()` before the fade.

### 0b. Fix `cleanup()` — kill tweens

```js
cleanup() {
  this.cancelAllTimers();
  this.tweens.killAll();  // NEW: prevent tween callbacks on stale refs
  this.game.events.off('hidden', this.onHidden, this);
  this.game.events.off('visible', this.onVisible, this);
}
```

### 0c. Fix boss vulnerability tween leak

In `bossDefeated()`, call `endBossVulnerability()` first:
```js
bossDefeated() {
  this.bossState = 'defeated';
  this.endBossVulnerability();  // kill flash tween before fly-off tween
  this.cancelAllTimers();
  // ... rest of existing code
}
```

### Research Insights (Race Condition Review)
- Without these guards, player death during the 3.1s victory sequence causes competing camera fades
- Touch button mashing by toddlers will trigger double-fire without debouncing
- Tweens from a previous scene can fire `onComplete` callbacks on destroyed objects

---

## GROUP A: Core Mechanics

### Change 1: Replace Paw Attack with Chase's Net

**Goal:** Swap the red circle paw hitbox with a net projectile that travels ~192px (3 Chase-widths) at 300px/s, then disappears. Net defeats kitties and damages vulnerable Humdinger.

**Files:**
- `src/config/constants.js` — Replace PAW_ATTACK_* constants with NET_SPEED=300, NET_MAX_DISTANCE=192, NET_COOLDOWN=500
- `src/scenes/PreloadScene.js` — Generate net-projectile texture (24x16), net-button texture, net-touch texture
- `src/scenes/GameScene.js` — Replace doPawAttack() with doNetAttack() using object pool pattern
- `src/utils/SFX.js` — Replace 'paw' sound (white noise) with 'net' sound (whoosh: 800->400Hz, 120ms)

**Touch button:** Update from paw icon to net icon on mobile controls.

### Research Insights — Object Pool Pattern (Critical)

**All 3 research agents agree: do NOT create/destroy physics sprites per shot.** Use a Phaser physics group as an object pool with persistent overlap colliders.

**Why:** Per-projectile collider creation causes:
- Collider accumulation in the physics world (checked every frame even after sprite destroyed)
- GC pressure from repeated allocations on mobile
- Race condition: overlap callback can fire on a destroyed net in the same frame it exceeds max distance

**Implementation pattern:**

```js
// In create() — set up pool + ONE persistent overlap per target group:
this.nets = this.physics.add.group({
  classType: Phaser.Physics.Arcade.Sprite,
  maxSize: 4,
  allowGravity: false,
  key: 'net-projectile',
});

this.physics.add.overlap(this.nets, this.enemies, (net, enemy) => {
  if (!net.active) return;
  net.setActive(false).setVisible(false);
  net.body.enable = false;
  this.defeatEnemy(enemy);
});

if (this.levelData.hasBoss) {
  this.physics.add.overlap(this.nets, this.boss, (net, boss) => {
    if (!net.active) return;
    net.setActive(false).setVisible(false);
    net.body.enable = false;
    if (this.bossState === 'vulnerable') {
      this.hitBossWithNet();
    }
  });
}
```

```js
// doNetAttack():
doNetAttack() {
  if (this.netOnCooldown) return;
  this.netOnCooldown = true;

  const sfx = this.registry.get('sfx');
  if (sfx) sfx.play('net');

  const dir = this.player.flipX ? -1 : 1;
  const net = this.nets.get(this.player.x + dir * 20, this.player.y, 'net-projectile');
  if (!net) return; // pool exhausted

  net.setActive(true).setVisible(true);
  net.body.enable = true;
  net.body.reset(this.player.x + dir * 20, this.player.y);
  net.setVelocityX(dir * NET_SPEED);
  net.setDepth(15);
  net.originX = this.player.x + dir * 20;

  this.time.delayedCall(NET_COOLDOWN, () => { this.netOnCooldown = false; });
}
```

```js
// In update() — distance check for pool cleanup:
this.nets.getChildren().forEach(net => {
  if (!net.active) return;
  if (Math.abs(net.x - net.originX) >= NET_MAX_DISTANCE) {
    net.setActive(false).setVisible(false);
    net.body.enable = false;
  }
});
```

**Cleanup in init():**
```js
// Reset pool state — Phaser handles the sprites via scene lifecycle,
// but explicitly deactivate all on level restart:
if (this.nets) {
  this.nets.getChildren().forEach(n => {
    n.setActive(false).setVisible(false);
    if (n.body) n.body.enable = false;
  });
}
```

**Procedural net texture (PreloadScene):**
```js
const netGfx = this.make.graphics({ add: false });
netGfx.fillStyle(0x4499dd);
netGfx.fillRect(2, 2, 20, 12);
netGfx.lineStyle(1, 0x226699);
for (let x = 2; x <= 22; x += 5) netGfx.lineBetween(x, 2, x, 14);
for (let y = 2; y <= 14; y += 4) netGfx.lineBetween(2, y, 22, y);
netGfx.fillStyle(0x885522);
netGfx.fillCircle(2, 8, 3);
netGfx.generateTexture('net-projectile', 24, 16);
netGfx.destroy();
```

**Touch debounce** — prevent rapid-fire from toddler mashing:
```js
if (this.touchIntent.net) {
  const now = this.time.now;
  if (now - (this._lastNetTime || 0) > 150) {
    wantsNet = true;
    this._lastNetTime = now;
  }
  this.touchIntent.net = false;
}
```

**Renames:** `pawOnCooldown` -> `netOnCooldown`, `touchIntent.paw` -> `touchIntent.net`, `hitBossWithPaw` -> `hitBossWithNet`, `'paw-touch'` -> `'net-touch'`, `'paw-button'` -> `'net-button'`

**Performance notes:**
- At 300px/s, a net moves ~5px/frame. No tunneling risk against 64px enemies.
- Pool maxSize of 4 means at most 4 overlap checks per enemy per frame — negligible.
- `body.enable = false` removes deactivated nets from physics simulation entirely.

**Sources:**
- [Phaser Forum: Shooting bullets with Arcade Groups](https://phaser.discourse.group/t/shooting-bullets-in-phaser-3-using-arcade-physics-groups/5368)
- [Ourcade: Object Pooling in Phaser 3](https://blog.ourcade.co/posts/2020/phaser-3-optimization-object-pool-matter-js-physics/)
- [Phaser Forum: Colliders not removed on sprite.destroy()](https://phaser.discourse.group/t/colliders-not-being-removed-when-calling-sprite-destroy/9312)

---

### Change 6: Humdinger Grounded / Follows Chase Vertically

**Goal:** Boss tracks Chase's ground level (platform surface) with smooth interpolation, preventing the bug where Humdinger floats above Chase.

**Files:**
- `src/scenes/GameScene.js`:
  - Track `playerGroundY` via platform collider callback
  - Lerp boss Y in `update()` with delta-time-corrected interpolation
  - Only track during approaching/vulnerable states

### Research Insights — Y-Tracking

**Do NOT use a 50ms timer for Y-tracking.** All research agents agree: put it in `update()`.

**Why timer is bad:**
- 50ms timer fires at ~20Hz while the game renders at 60Hz — boss movement appears jerky (updates for 1 frame, holds for 2 frames)
- Timer can fire after boss is destroyed if not properly tracked in `pendingTimers`
- Fixed lerp factor (0.15) produces different speeds at different actual frame rates

**Detect ground level via collider callback:**
```js
// In create(), modify the existing player-platform collider:
this.physics.add.collider(this.player, this.platforms, (player, platform) => {
  if (player.body.touching.down) {
    this.playerGroundY = platform.y - (platform.height / 2);
  }
});

// Default for ground level (no platform):
this.playerGroundY = GAME_HEIGHT - 100;
```

**Delta-time-corrected lerp in update():**
```js
// In update(), after player movement:
if (this.boss && this.boss.active &&
    (this.bossState === 'approaching' || this.bossState === 'vulnerable')) {
  const targetY = this.playerGroundY - 32; // boss center above ground
  const lerpFactor = 1 - Math.pow(0.85, delta / 16.67); // frame-rate independent
  this.boss.y = Phaser.Math.Linear(this.boss.y, targetY, lerpFactor);
}
```

**Alternative — velocity-based tracking** (more physics-friendly):
```js
const targetY = this.playerGroundY - 32;
const diff = targetY - this.boss.y;
if (Math.abs(diff) < 2) {
  this.boss.setVelocityY(0);
} else {
  const maxYSpeed = 80;
  this.boss.setVelocityY(Phaser.Math.Clamp(diff * 2, -maxYSpeed, maxYSpeed));
}
```

The velocity-based approach is slightly better because it works with the physics pipeline rather than directly mutating position, which can cause collision glitches.

**Sources:**
- [Phaser Math interpolation](https://rexrainbow.github.io/phaser3-rex-notes/docs/site/interpolation/)
- [Phaser Camera lerp API](https://newdocs.phaser.io/docs/3.80.0/focus/Phaser.Cameras.Scene2D.Camera-lerp)

---

### Change 2: Boss Fight Stages 1 & 2 — Single-Hit Chase-Away

**Goal:** Stages 1-2 have a mini-boss encounter: Humdinger approaches, flashes vulnerable, one hit makes him flee right. No barrier. Teaches mechanic before the real stage 3 fight.

**Files:**
- `src/config/constants.js` — Add `miniBoss: true` to levels 0-1, set `bossHP: 1`
- `src/scenes/GameScene.js`:
  - Skip barrier creation when `miniBoss: true`
  - Shorten approach timer to 1500ms (vs 2500ms) for mini-boss
  - In bossDefeated(): mini-boss branch -> boss flees right, then show transition arrow
  - Update boss prompt text: "USE NET! (X)"

### Research Insights — Mini-Boss Flee

**Disable physics body BEFORE flee animation** to prevent the "dead man walking" problem:
```js
// In bossDefeated() mini-boss branch:
if (this.levelData.miniBoss) {
  // Remove collider FIRST — defeated boss must not damage player
  if (this.bossCollider) {
    this.physics.world.removeCollider(this.bossCollider);
    this.bossCollider = null;
  }
  this.boss.body.enable = false; // no more physics

  // Use tween for movement (velocity won't work with body disabled):
  this.tweens.add({
    targets: this.boss,
    x: this.boss.x + 600,
    alpha: 0,
    duration: 2000,
    ease: 'Power2',
    onComplete: () => { if (this.boss) this.boss.destroy(); },
  });

  this.showStageTransitionArrow();
  return;
}
```

**Boss visual feedback layers** — for toddler readability, layer multiple cues during vulnerability:
- Yellow tint (existing)
- Scale pulse (1.0 -> 1.15, yoyo, more visible than alpha for kids)
- "USE NET! (X)" text prompt

---

## GROUP B: Game Flow

### Change 5: Opening Story Screen

**Goal:** New StoryScene between Tutorial and Game. Shows Humdinger with caged Skye, kitties flanking, Chase on left. Story text. Tap to continue. Shows every time.

**Files:**
- `src/scenes/StoryScene.js` — NEW FILE
- `src/main.js` — Register StoryScene in scene array
- `src/scenes/TutorialScene.js` — Transition to StoryScene instead of GameScene
- `src/scenes/MenuScene.js` — After tutorial seen, go to StoryScene (not GameScene)

### Research Insights — Scene Transitions

**Add `_transitioning` flag** to prevent double-triggers during fade:
```js
proceed() {
  if (this._transitioning) return;
  this._transitioning = true;
  this.input.enabled = false; // block input during fade
  this.cameras.main.fadeOut(300, 0, 0, 0);
  this.cameras.main.once('camerafadeoutcomplete', () => {
    this.scene.start('GameScene', { level: 0 });
  });
}
```

**Scene flow should be documented in one place:**
```js
// In constants.js — documentation-as-code:
// SCENE_FLOW: MenuScene -> TutorialScene (first time) -> StoryScene -> GameScene -> VictoryScene
```

---

### Change 7: Stage Transition Arrow

**Goal:** Gold bouncing arrow at end of stages 1-2, appears after mini-boss defeated, pointing right toward next stage.

**Files:**
- `src/scenes/PreloadScene.js` — Generate stage-arrow texture (gold right-pointing triangle)
- `src/scenes/GameScene.js` — showStageTransitionArrow() method, called from mini-boss bossDefeated() branch, positions arrow near exitX with bobbing tween

No additional research insights needed — follows existing tween bob pattern exactly.

---

### Change 4: End Sequence — Chase Walks to Cage

**Goal:** After stage 3 boss defeat, cage opens visually. Player must walk Chase to Skye. On overlap: both bounce together ~2s, then fade to VictoryScene.

**Files:**
- `src/scenes/GameScene.js`:
  - Modify bossDefeated() Skye branch: animate cage open, create overlap zone at Skye
  - Add onReachSkye() method: enter cinematicMode, both sprites bounce, fade to victory
  - Add bouncing arrow pointing toward Skye as visual cue

### Research Insights — End Sequence Safety

**Use `cinematicMode` flag** (from Step 0) to prevent damage during walk-to-cage. But allow player movement (rightward only or full control) so they can physically walk to Skye:

```js
// In update(), at the top:
if (this.cinematicMode) {
  // Allow movement but skip damage processing
  // Player can still walk to Skye
  // Just guard damage in hitEnemy/bossHitPlayer (already done in Step 0)
}
```

**onReachSkye() should freeze input after overlap:**
```js
onReachSkye() {
  if (this.skyeReached) return;
  this.skyeReached = true;
  this.isTransitioning = true; // now fully block input

  this.player.setVelocityX(0);
  // ... bounce animation, then fade to victory
}
```

---

### Change 13: Instruction Updates

**Files:**
- `src/scenes/TutorialScene.js` — Change "Paw Attack" to "Shoot Net", add gameplay tips
- `src/scenes/UIScene.js` — Change "[X] = Paw Attack" to "[X] = Net"
- `src/scenes/GameScene.js` — Change "USE PAW! (X)" to "USE NET! (X)"

### Research Insights
- Pattern review confirms all text references to "paw" should be updated
- Also rename the TutorialScene's `'paw-button'` texture reference to `'net-button'`

---

## GROUP C: Polish & Fixes

### Change 8: Kitty Collision Hitbox

**Goal:** Reduce kitty physics body to ~40x48 centered in 64x64 sprite for fairer collisions.

**Files:**
- `src/scenes/GameScene.js` — After kitty creation: `kitty.body.setSize(40, 48); kitty.body.setOffset(12, 12);`

### Research Insights — Stomp Detection

The current stomp check uses a fragile `+ 16` pixel tolerance. A more robust approach compares vertical vs horizontal overlap depth:

```js
playerEnemyCollision(player, enemy) {
  if (!enemy.active || !enemy.body.enable) return;

  const overlapFromTop = player.body.bottom - enemy.body.top;
  const overlapFromLeft = player.body.right - enemy.body.left;
  const overlapFromRight = enemy.body.right - player.body.left;
  const horizontalOverlap = Math.min(overlapFromLeft, overlapFromRight);

  const isStomping = player.body.velocity.y > 0 &&
    overlapFromTop > 0 &&
    overlapFromTop < enemy.body.halfHeight &&
    overlapFromTop < horizontalOverlap;

  if (isStomping) {
    this.defeatEnemy(enemy);
    player.setVelocityY(BOUNCE_VELOCITY);
    this.jumpsRemaining = 2;
  } else {
    this.hitEnemy(player, enemy);
  }
}
```

---

### Change 9: Kitty Movement — Fix Patrol

**Goal:** Kitties appear stationary. Root cause identified + fix.

**Files:**
- `src/config/constants.js` — Widen all patrol bounds, ensure 192px minimum range
- `src/scenes/GameScene.js` — Increase base speed + fix velocity zeroing bug

### Research Insights — Root Cause Found

**The enemy-platform collider (line 119) is likely zeroing patrol velocity.** When an immovable body collides with a static platform body, arcade physics can reset the velocity as part of overlap resolution.

**Fix — two-part:**

1. **Remove the enemy-platform collider** if enemies don't need gravity (they have `setAllowGravity(false)` already):
```js
// DELETE or comment out:
// this.physics.add.collider(this.enemies, this.platforms);
```

2. **Add velocity recovery** as a safety net in update():
```js
this.enemies.getChildren().forEach((kitty) => {
  if (!kitty.active || !kitty.body || !kitty.body.enable) return;

  // Only set velocity at direction change (not every frame):
  if (kitty.x <= kitty.patrolLeft && kitty.body.velocity.x <= 0) {
    kitty.setVelocityX(kitty.speed);
    kitty.setFlipX(false);
  } else if (kitty.x >= kitty.patrolRight && kitty.body.velocity.x >= 0) {
    kitty.setVelocityX(-kitty.speed);
    kitty.setFlipX(true);
  }

  // Safety: recover from zeroed velocity (collider bug)
  if (kitty.body.velocity.x === 0) {
    const center = (kitty.patrolLeft + kitty.patrolRight) / 2;
    const dir = kitty.x < center ? 1 : -1;
    kitty.setVelocityX(dir * kitty.speed);
    kitty.setFlipX(dir < 0);
  }
});
```

3. **Increase speed and widen ranges:** `kitty.speed = 60 + Math.random() * 20` (was 40+random*20). Ensure all patrol bounds in constants.js are 192px+ wide.

**Sources:**
- [Phaser Forum: Patrolling enemy](https://phaser.discourse.group/t/patrolling-enemy/5919)
- [Phaser Forum: Enemy AI move side to side](https://phaser.discourse.group/t/how-to-make-enemy-ai-move-side-to-side-on-platform/5160)

---

### Change 10: Mobile vs. Desktop Controls

**Goal:** Only show touch buttons on touch-capable devices.

**Files:**
- `src/scenes/GameScene.js` — Smart touch detection, conditionally call createTouchControls()

### Research Insights — Better Detection

**Don't use `'ontouchstart' in window`** — it has false positives on Chrome desktop. Use CSS media queries for primary pointer type:

```js
// In create():
const primaryIsCoarse = window.matchMedia('(pointer: coarse)').matches;
const cannotHover = window.matchMedia('(hover: none)').matches;
const hasTouchPoints = navigator.maxTouchPoints > 0;
const anyCoarse = window.matchMedia('(any-pointer: coarse)').matches;

// Show touch controls on phones/tablets (coarse primary + no hover)
// Also show on small touch devices as fallback
this.isTouchDevice = (primaryIsCoarse && cannotHover) ||
  (anyCoarse && hasTouchPoints && window.innerWidth <= 1024);

if (this.isTouchDevice) {
  this.createTouchControls();
}
```

| Method | Phones | Tablets | Touch Laptops | Desktop |
|--------|--------|---------|---------------|---------|
| `(pointer: coarse) + (hover: none)` | Shows | Shows | Hides | Hides |
| Fallback: small viewport + touch | Shows | Shows | Shows | Hides |

Touch laptops get keyboard controls by default but can still use touch events if they tap the game canvas.

**Source:** [Patrick H. Lauke's touchscreen detection research](https://patrickhlauke.github.io/touch/touchscreen-detection/)

---

### Change 11: Pup Treat Bugs

**Flickering fix:** Use `body.setDirectControl(true)` (Phaser 3.70+) instead of replacing tweens with sine-wave.

**Below-surface fix:** Clamp treat Y positions during creation to be above the nearest platform surface.

**Files:**
- `src/scenes/GameScene.js` — Add directControl flag to treats; add platform-aware Y clamping

### Research Insights — Root Cause

**The flickering is caused by tweens fighting with the physics engine.** When you tween `y` on a physics sprite, the physics body tracks `body.position` separately. On each physics step, the body tries to reconcile, producing a one-frame snap.

**Best fix — `setDirectControl(true)` (since Phaser 3.70):**
```js
level.collectibles.forEach((c) => {
  // Clamp Y above nearest platform surface
  let clampedY = c.y;
  level.platforms.forEach((p) => {
    if (c.x >= p.x && c.x <= p.x + p.w) {
      if (c.y > p.y - 16 && c.y < p.y + p.h) {
        clampedY = Math.min(clampedY, p.y - 20);
      }
    }
  });

  const treat = this.physics.add.image(c.x, clampedY, 'treat');
  treat.body.setAllowGravity(false);
  treat.body.setImmovable(true);
  treat.body.setDirectControl(true);  // KEY FIX: physics won't fight the tween
  treat.setDepth(5);
  this.collectibles.add(treat);

  // Tween is now safe — physics syncs FROM the game object
  this.tweens.add({
    targets: treat,
    y: clampedY - 6,
    duration: 1000 + Math.random() * 500,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
});
```

This is cleaner than the sine-wave approach because it keeps the existing tween pattern and only adds one line. `setDirectControl(true)` tells the physics engine: "I'm managing this object's position directly; sync the body from the game object, not the other way around."

**Source:** [Phaser official docs: Arcade Physics directControl](https://docs.phaser.io/phaser/concepts/physics/arcade)

---

### Change 12: Kitty Counter (HUD)

**Goal:** Purple kitty counter next to treat counter, increments on kitty capture, persists across all stages (resets only on new game).

**Files:**
- `src/config/GameState.js` — Add `kittiesCaptured: 0` to state, add `captureKitty()` method
- `src/scenes/UIScene.js` — Add kitty counter text at x=120, listen for 'kitty-captured' event
- `src/scenes/GameScene.js` — Emit 'kitty-captured' event in defeatEnemy()

### Research Insights

**defeatEnemy() needs re-entry protection.** If two nets hit the same kitty in the same frame, the function runs twice, incrementing the counter twice and starting two defeat tweens.

```js
defeatEnemy(enemy) {
  if (!enemy || !enemy.active) return;
  enemy.active = false;        // prevent re-entry SYNCHRONOUSLY
  enemy.body.enable = false;
  this.enemies.remove(enemy, false, false); // remove from group immediately

  const state = this.registry.get('state');
  state.captureKitty();
  this.game.events.emit('kitty-captured', state.kittiesCaptured);

  // ... defeat tween (spin + fly off + destroy)
}
```

**UIScene cleanup is required** — add to shutdown handler:
```js
this.game.events.off('kitty-captured', this.onKittyCaptured, this);
```

**Persistence:** `kittiesCaptured` persists across stages because `resetHealth()` only touches `this.health`. Add a comment to make this intent clear:
```js
// GameState.js
resetHealth() {
  // Per-level reset. Does NOT reset cross-level progress (treats, kitties).
  this.health = MAX_HEALTH;
}
```

---

### Change 3: Stage 3 Boss — No Changes

Verify the existing 3-hit shrink-and-fly mechanic still works after changes 1, 2, 4, and 6. Key things to test:
- Net hits boss during vulnerability window (replaces paw)
- Boss Y-tracking works across all 3 stages
- End sequence (walk to cage) triggers correctly after defeat
- `cinematicMode` prevents damage during celebration

---

## Key Design Decisions

- **Net** uses object pool (Phaser physics group, maxSize=4) with persistent overlaps — no per-shot allocation
- **Mini-boss** (stages 1-2): shortened cycle, no barrier, flee via tween (body disabled)
- **Boss Y-tracking**: delta-time-corrected lerp in update() — NOT a timer
- **Kitty patrol**: 60-80px/s speed, 192px+ range, velocity recovery safety net, remove enemy-platform collider
- **Treat fix**: `body.setDirectControl(true)` lets tweens work without physics conflict
- **Kitty counter**: persists across stages, resets only from MenuScene
- **Touch detection**: `(pointer: coarse)` + `(hover: none)` media queries, not `ontouchstart`
- **Safety**: `cinematicMode` for end sequence, `isTransitioning` for scene transitions, `tweens.killAll()` in cleanup

## Critical File Impact

| File | Changes |
|------|---------|
| GameScene.js | 10 of 13 changes + safety infrastructure |
| constants.js | 4 changes |
| PreloadScene.js | 2 changes |
| UIScene.js | 2 changes |
| GameState.js | 1 change |
| TutorialScene.js | 1 change |
| MenuScene.js | 1 change |
| main.js | 1 change |
| SFX.js | 1 change |
| StoryScene.js | NEW |

## Edge Cases Checklist

- [ ] Player fires net, immediately dies — net still in flight when scene restarts (pool handles this)
- [ ] Two nets hit same kitty in one frame — re-entry guard in defeatEnemy()
- [ ] Boss defeated while vulnerable — endBossVulnerability() called first
- [ ] Player dies during victory celebration — cinematicMode blocks damage
- [ ] Mini-boss flees through player — body disabled before tween
- [ ] Touch double-tap fires two nets — timestamp debounce
- [ ] Scene transition during active nets — pool reset in init()
- [ ] Enemy patrol velocity zeroed by collider — recovery check in update()
- [ ] Treat spawns inside platform — Y-clamping during creation
- [ ] Desktop Chrome false-positive touch — media query detection

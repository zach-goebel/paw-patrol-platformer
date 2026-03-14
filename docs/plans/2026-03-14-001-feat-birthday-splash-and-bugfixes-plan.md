---
title: "feat: Birthday Splash Screen & Cross-Platform Bug Fixes"
type: feat
status: active
date: 2026-03-14
---

# Birthday Splash Screen & Cross-Platform Bug Fixes

## Overview

Bundle of 7 items for the Paw Patrol platformer: 1 new feature (birthday splash screen) and 6 bug fixes across both platforms and mobile-only. The mobile audio bugs (items 5-7) share a root cause in the AudioManager architecture and should be fixed together.

**Branch:** `fixes-and-splash` (do NOT merge to main until user has tested everything)

## Items by Platform

### BOTH Platforms

| # | Item | Type | Priority |
|---|------|------|----------|
| 1 | Birthday splash screen before title | Feature | High |
| 2 | Boss defeat SFX too quiet | Bug | Medium |
| 3 | Skye's cage opens too fast | Bug | Medium |
| 4 | Net projectile sprite too hard to see | Bug | Low |

### MOBILE Only

| # | Item | Type | Priority |
|---|------|------|----------|
| 5 | Boss theme music never plays | Bug | Critical |
| 6 | No music at all after level 1 boss | Bug | Critical |
| 7 | Boss defeat SFX doesn't trigger | Bug | Critical |

## Problem Statement / Motivation

This game is a birthday present for a toddler named Waylon. The birthday splash makes the gift feel personal and solves the awkward double-tap audio unlock UX. The mobile audio bugs are critical because kids will primarily play on phones/tablets — right now the game is essentially silent after the first boss on mobile. The cage/SFX/net fixes polish the gameplay experience.

---

## Proposed Solution

### Implementation Order

The mobile audio bugs (5, 6, 7) share a root cause and must be fixed first — they are the foundation. The birthday splash (1) then becomes the new audio unlock surface. Remaining items (2, 3, 4) are independent.

```
Phase 1: Fix AudioManager for mobile (Items 5, 6, 7)
Phase 2: Birthday splash screen (Item 1) — becomes new audio unlock
Phase 3: Boss defeat volume (Item 2)
Phase 4: Cage timing (Item 3)
Phase 5: Net sprite (Item 4)
```

---

## Item Details

### Item 1: Birthday Splash Screen (BOTH)

**New file:** `src/scenes/BirthdaySplashScene.js`

**Scene flow change:**
```
BEFORE: PreloadScene -> MenuScene -> StoryScene -> ...
AFTER:  PreloadScene -> BirthdaySplashScene -> MenuScene -> StoryScene -> ...
```

**Requirements:**
- "Happy Birthday Waylon!" text in retro pixel style (use existing monospace font with large size + heavy stroke to match game aesthetic)
- Pixel art balloons (procedurally generated, consistent with existing sprite style)
- Chase sprite on left, Skye sprite on right
- Large arcade-cabinet-style "TAP TO PLAY" button with glow/pulse animation
- This tap is the **primary audio unlock point** — must unlock BOTH:
  - Web Audio context (`sfx.ctx.resume()`)
  - All HTML5 Audio elements (pre-created AudioManager pool)
- Camera fade transition to MenuScene
- Shows on every launch (no "seen" flag — it's a birthday gift, the splash is charming)

**MenuScene changes:**
- Remove the existing first-tap-unlocks-audio guard logic (`_musicStarted` flag, unlock listeners)
- MenuScene assumes audio is already unlocked
- Single tap/click on play button starts the game immediately
- Title music starts automatically on MenuScene `create()` (audio is already unlocked)

**Key files to modify:**
- `src/scenes/BirthdaySplashScene.js` (new)
- `src/scenes/PreloadScene.js` — change next scene from `MenuScene` to `BirthdaySplashScene`
- `src/scenes/MenuScene.js` — remove first-tap audio unlock logic, simplify to single-tap
- `src/main.js` — register BirthdaySplashScene in Phaser config

### Item 2: Boss Defeat SFX Volume (BOTH)

**Root cause:** `SFX.FILE_VOLUMES['sfx-boss-defeat']` is `1.0`, which is the same as default max gain. Other SFX are at 0.45-0.6, so boss defeat doesn't stand out.

**Fix in `src/utils/SFX.js`:**
- Increase `sfx-boss-defeat` gain to `1.8`–`2.0` (will clip slightly but that's the "comically loud" intent — short burst, punchy)
- Alternatively, normalize the `sfx-boss-defeat.wav` file itself to be louder at the source

**Fix in `src/scenes/GameScene.js`:**
- For mini-boss defeats (levels 0, 1): add a brief music duck — `stopMusic(0)` before SFX, then resume gameplay music after ~800ms delay. This prevents the crossfade from masking the defeat sound.
- Final boss (level 2) already does `stopMusic(0)` — no change needed there.

**Verify:** `bossDefeated()` calls `sfx.play('sfx-boss-defeat')` for ALL boss types (mini and final). Currently it does — line 632 of GameScene.js fires before the mini/final branch.

### Item 3: Skye's Cage Opens Too Fast (BOTH)

**Root cause:** `startSkyeRescue()` fires from the boss spin-off tween's `onComplete` callback (800ms after defeat), regardless of Chase's position. The cage tween is only 600ms with `Back.easeIn`.

**Fix in `src/scenes/GameScene.js`:**

1. **Gate `startSkyeRescue()`:** When called, show the bouncing arrow immediately but do NOT start the cage-open tween yet. Set a flag like `_awaitingCageOpen = true`.

2. **Proximity check in `update()`:** When `_awaitingCageOpen` is true, check if Chase's sprite is within the camera viewport AND within ~250px of the cage X position. Once true, trigger the cage-open sequence.

3. **Slower cage animation:** Increase cage tween duration from 600ms to ~1800ms. Change easing to something more dramatic (e.g., `Sine.easeIn` for a slow start). Consider adding:
   - Cage bars shake/rattle for 500ms before opening
   - Cage flies upward (positive Y tween) rather than just fading
   - Skye does a small celebration animation when freed

4. **Failsafe compatibility:** The `bossGoneFailsafe` cage-zone overlap (line 306-323) already requires Chase to be near the cage, so it's naturally compatible.

### Item 4: Net Projectile Sprite (BOTH)

**Current:** Procedurally generated 24x16 blue rectangle with grid lines in `PreloadScene.createPlaceholderTextures()` (lines 86-95).

**Fix in `src/scenes/PreloadScene.js`:**
- Redesign the procedural texture to look more net-like:
  - Wider opening (trapezoidal/fan shape instead of rectangle)
  - More visible cross-hatching pattern
  - Lighter/brighter color for visibility
  - Optional: handle/pole extending from the back
- Keep dimensions compatible with physics body (may need slight adjustment)
- If user provides a custom sprite later, swap the procedural texture for the loaded image

**Note:** Ask user if they want to provide a custom `net.png` sprite before spending time on procedural improvements. This is lowest priority.

### Items 5, 6, 7: Mobile Audio Fixes (MOBILE ONLY)

**Shared root cause:** The AudioManager creates `new Audio(path)` elements on demand inside `playMusic()`. On mobile browsers (especially iOS Safari), `audio.play()` returns a rejected promise when called outside a direct user gesture handler. When the boss fight starts, `startBossFight()` calls `playMusic('theme-boss')` from a Phaser overlap callback — not a user gesture. The play fails, the old track was already faded out, and the AudioManager is left in a broken state with no playing track and no way to recover.

**The cascade:**
1. Player enters boss trigger zone (programmatic, not gesture)
2. `playMusic('theme-boss')` fades out gameplay music, creates new Audio element, calls `.play()` → REJECTED
3. `.catch()` resets `currentAudio` and `currentKey` to `null`
4. Now: no music playing, no track reference
5. Boss defeated → `playMusic('theme-gameplay')` creates another new Audio → REJECTED again
6. Every subsequent `playMusic()` call creates new unlocked Audio elements → all fail
7. Game is permanently silent

**Fix approach — AudioManager pre-creation pool:**

Restructure `src/utils/AudioManager.js`:

1. **Pre-create all Audio elements** in constructor or an `unlock()` method:
   ```javascript
   // Called during first user gesture (BirthdaySplashScene tap)
   unlock() {
     for (const [key, path] of Object.entries(MUSIC_TRACKS)) {
       const audio = new Audio(path);
       audio.load();
       audio.play().then(() => audio.pause()).catch(() => {});
       audio.currentTime = 0;
       this._pool[key] = audio;
     }
     this._unlocked = true;
   }
   ```

2. **Reuse pool elements in `playMusic()`:** Instead of `new Audio(path)`, use `this._pool[key]`. Reset `currentTime = 0`, set volume, call `.play()`. Since the element was already unlocked during a gesture, subsequent programmatic `.play()` calls succeed.

3. **Robust error recovery:** If `.play()` still fails somehow, don't null out the current state. Keep the previous track reference so the next call can retry.

4. **SFX fix (`src/utils/SFX.js`):** The `play()` method calls `this.ctx.resume()` but starts the buffer source immediately without awaiting the resume. Fix:
   ```javascript
   async play(name) {
     if (this.ctx.state === 'suspended') {
       await this.ctx.resume();
     }
     // ... then play the buffer
   }
   ```
   This ensures the Web Audio context is actually running before attempting playback. Alternatively, since `await` might cause timing issues, pre-resume the context during the splash screen tap alongside the AudioManager unlock.

5. **Wire unlock into BirthdaySplashScene:** The tap handler calls both `audioManager.unlock()` and `sfx.ctx.resume()`.

**Key files:**
- `src/utils/AudioManager.js` — major refactor: pre-creation pool, unlock method, reuse elements
- `src/utils/SFX.js` — ensure context is resumed before playing file-based sounds
- `src/scenes/BirthdaySplashScene.js` — call unlock methods on first tap
- `src/main.js` — may need to adjust iOS audio unlock handler

---

## Technical Considerations

### Architecture Impact
- New scene added to scene chain (BirthdaySplashScene)
- AudioManager refactored from on-demand creation to pre-creation pool
- MenuScene simplified (audio unlock logic removed)

### Mobile Browser Compatibility
- iOS Safari: strictest autoplay policy, requires `.play()` during user gesture to unlock each Audio element
- Chrome Android: more lenient, but still requires initial gesture for AudioContext
- The pre-creation pool approach works for both

### Performance
- Pre-creating 5 Audio elements and loading them adds ~200ms to the first gesture, but this is imperceptible since the player is already tapping
- No impact on gameplay performance

### Risk: Audio Element Reuse
- HTML5 Audio elements can sometimes get into weird states when reused heavily (especially on iOS)
- Mitigation: set `currentTime = 0` and call `load()` before each reuse if needed
- Test thoroughly on actual iOS devices

---

## Acceptance Criteria

### Item 1: Birthday Splash
- [ ] Splash screen appears as first thing after asset loading
- [ ] Shows "Happy Birthday Waylon!" in pixel/retro style
- [ ] Chase sprite visible on left, Skye sprite visible on right
- [ ] Pixel art balloons visible
- [ ] Large "TAP TO PLAY" button with glow/pulse animation
- [ ] Single tap transitions to MenuScene with fade
- [ ] Audio is fully unlocked after splash tap (both music and SFX)
- [ ] MenuScene play button starts game immediately (single tap)
- [ ] Works on both desktop (click/keypress) and mobile (tap)

### Item 2: Boss Defeat Volume
- [ ] `sfx-boss-defeat` is dramatically louder than all other sounds
- [ ] Triggers on level 0 mini-boss defeat
- [ ] Triggers on level 1 mini-boss defeat
- [ ] Triggers on level 2 final boss defeat
- [ ] Brief music silence on mini-boss defeats so SFX isn't masked

### Item 3: Cage Timing
- [ ] Cage does NOT open until Chase is visible on screen near it
- [ ] Bouncing arrow appears immediately after boss defeat to guide player
- [ ] Cage animation is slow enough to clearly see Skye was caged (~1800ms)
- [ ] Cage visually flies away / breaks apart (not just fade)
- [ ] Works with bossGoneFailsafe path

### Item 4: Net Sprite
- [ ] Net projectile is more visible than current blue rectangle
- [ ] Looks more like an actual net (wider opening, cross-hatch pattern)
- [ ] Physics body still works correctly with updated dimensions
- [ ] Ask user about custom sprite before extensive procedural work

### Item 5: Mobile Boss Music
- [ ] Boss theme music plays when Humdinger appears on mobile
- [ ] Works in both landscape and portrait orientations
- [ ] Works on iOS Safari and Chrome Android

### Item 6: Mobile Music Recovery
- [ ] Gameplay music resumes after mini-boss defeats on mobile
- [ ] Boss music plays on levels 2 and 3 on mobile
- [ ] Victory fanfare plays on mobile
- [ ] Title theme plays on leaderboard screen on mobile

### Item 7: Mobile Boss Defeat SFX
- [ ] `sfx-boss-defeat` sound plays on mobile for all 3 boss encounters
- [ ] Volume matches the "comically loud" setting from Item 2

---

## Dependencies & Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| iOS Audio element reuse quirks | Music playback fails silently | Test on real iOS devices, add fallback re-creation |
| Cage timing breaks failsafe | Player gets stuck after boss | Gate on `startSkyeRescue()` itself, failsafe overlap already requires proximity |
| Gain > 1.0 causes distortion | Boss defeat sounds bad instead of funny | Test at 1.5 and 2.0, pick the funniest |
| Net sprite physics mismatch | Nets pass through enemies | Keep hitbox similar to current 24x16 |
| Birthday splash on repeat visits | Could feel stale after birthday | Acceptable — it's charming and doubles as audio unlock |

---

## Git Workflow

```bash
git checkout -b fixes-and-splash
# Implement all items
# Push to origin for testing
# Do NOT merge to main until user confirms all items tested
```

---

## Sources & References

### Internal References
- AudioManager: `src/utils/AudioManager.js` — HTML5 Audio music manager with crossfade
- SFX system: `src/utils/SFX.js` — Web Audio hybrid (synth + file-based)
- Boss fight logic: `src/scenes/GameScene.js:287-694` — boss lifecycle, defeat, cage rescue
- Net projectile generation: `src/scenes/PreloadScene.js:86-95` — procedural texture
- Mobile audio unlock: `src/main.js:118-133` — iOS touchstart/touchend handler
- MenuScene audio unlock: `src/scenes/MenuScene.js:117-162` — two-tap pattern
- Cage rescue: `src/scenes/GameScene.js:696-766` — `startSkyeRescue()` and `onReachSkye()`
- SFX volumes: `src/utils/SFX.js` — `FILE_VOLUMES` map
- Scene config: `src/main.js` — Phaser game config with scene list

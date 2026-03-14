# Sound Design Implementation Plan

## Current State

- **1 music file:** `theme.mp3` in `public/assets/audio/` — plays on menu, loops through gameplay
- **9 synthesized SFX:** Generated via Web Audio API oscillators in `src/utils/SFX.js` (jump, double-jump, collect, stomp, net, hurt, boss-hit, tick, victory)
- **Dual audio strategy:** HTML5 `<audio>` on mobile (iOS silent switch workaround), Phaser Web Audio on desktop
- **Scene flow:** Menu → Story → Tutorial → GameScene (3 levels with bosses) → Victory → NameEntry → Leaderboard

## Plan Overview

The work breaks into 3 phases:
1. **Audio file acquisition** — Get all music tracks and sound effect files into `public/assets/audio/`
2. **Audio manager refactor** — Build a proper audio manager that handles scene-specific music transitions
3. **Wire up everything** — Connect new audio to each scene and trigger point

---

## Phase 1: Audio File Acquisition

### Music Tracks (5 total)

| Track | File Name | Source | Length | Notes |
|-------|-----------|--------|--------|-------|
| Title Screen | `theme-title.mp3` | **YOU: Suno** | ~60s, looping | Prompt: "8-bit chiptune version of Paw Patrol theme song, upbeat kids adventure, loopable" |
| Story Screen | `theme-story.mp3` | **YOU: Suno** | ~20-30s, looping | Prompt: "8-bit chiptune dramatic tense scene, villain kidnapping, kid-friendly suspense, short loop" |
| Gameplay | `theme-gameplay.mp3` | **Evaluate existing `theme.mp3`** | ~60-90s, looping | Keep current if good enough, or YOU generate replacement via Suno: "8-bit chiptune platformer adventure level music, upbeat energetic kids game" |
| Boss Battle | `theme-boss.mp3` | **YOU: Suno** | ~30-60s, looping | Prompt: "8-bit chiptune boss battle theme, intense fast tempo, villain fight, kids platformer game" |
| Victory/Ending | `theme-victory.mp3` | **YOU: Suno** | ~30-45s | Prompt: "8-bit chiptune triumphant victory fanfare, royal trumpets, celebration, transitions into adventure theme, kids game" |

### Sound Effects (6 triggers)

| Trigger | File Name(s) | Source | Notes |
|---------|-------------|--------|-------|
| Chase shoots net | `sfx-bark.wav`, `sfx-net-call.wav` | **YOU: jsfxr or Suno** | Two variants — game randomly picks one. For bark: jsfxr "powerup" preset, pitch down. For "net!": short vocal clip from show or Suno |
| Jump | `sfx-jump.wav` | **I'll generate programmatically** OR keep current synth | Already works on all levels via SFX.js — verify |
| Collect pup treat | `sfx-collect.wav` | **I'll generate programmatically** OR jsfxr | jsfxr "pickup/coin" preset — bright happy chime |
| Defeat a kitty | `sfx-kitty-defeat.wav` | **YOU: short clip** | Angry meow sound — jsfxr can't do this well. Suno prompt: "single angry cat meow sound effect, short, funny" or find a free SFX |
| Defeat Humdinger | `sfx-boss-defeat.wav` | **YOU: short clip** | "Oh no!" groan — Suno or free SFX site |
| Get hit by kitty | `sfx-hurt.wav` | **I'll generate programmatically** OR keep current synth | Already exists in SFX.js |

### Decision: Keep Synthesized SFX or Replace with Files?

**Recommendation:** Hybrid approach.
- **Keep synth for:** jump, double-jump, collect, hurt, tick (these sound fine as retro bleeps)
- **Replace with audio files for:** net (bark/"net!"), kitty defeat (meow), boss defeat (groan), victory (fanfare)
- This minimizes your workload while adding character where it matters most

### What I Need From You

1. **Generate 4-5 music tracks** via Suno with the prompts above → drop as `.mp3` into `public/assets/audio/`
2. **Generate 3-4 sound effects** that need voice/character:
   - `sfx-bark.wav` — Chase bark (short, ~0.5s)
   - `sfx-net-call.wav` — Chase saying "net!" (short, ~0.5s)
   - `sfx-kitty-defeat.wav` — Angry cat meow (~0.5-1s)
   - `sfx-boss-defeat.wav` — Humdinger "oh no!" groan (~1s)
3. **Decision on gameplay theme** — keep current `theme.mp3` or generate a replacement?

---

## Phase 2: Audio Manager Refactor

### New File: `src/utils/AudioManager.js`

Replace the ad-hoc music handling in MenuScene with a centralized audio manager that:

- Manages all music tracks with crossfade transitions
- Handles mobile vs desktop playback (HTML5 Audio vs Phaser Web Audio)
- Provides `playMusic(trackKey, { loop, volume, fadeIn })` and `stopMusic({ fadeOut })`
- Stores in game registry as `audioManager` alongside existing `sfx`
- Handles iOS audio context resume on first interaction

### Update `src/utils/SFX.js`

- Add support for **file-based sound effects** alongside synthesized ones
- New method: `addFileSound(name, audioBuffer)` — preloaded audio buffers
- Update `play()` to check for file-based sounds first, fall back to synth
- Add `playRandom(names[])` for the bark/net alternation

### PreloadScene Changes

- Load all new music tracks: `theme-title`, `theme-story`, `theme-gameplay`, `theme-boss`, `theme-victory`
- Load all new SFX files: `sfx-bark`, `sfx-net-call`, `sfx-kitty-defeat`, `sfx-boss-defeat`
- Show audio-specific loading progress

---

## Phase 3: Wire Up Audio to Scenes

### Scene-by-Scene Wiring

| Scene | Music | SFX Changes |
|-------|-------|-------------|
| **MenuScene** | Play `theme-title` (loop). Stop current theme handling, use AudioManager instead | None |
| **StoryScene** | Fade out title music → Play `theme-story` (loop) | None |
| **TutorialScene** | Continue story music or silence | None |
| **GameScene** (levels 0-1) | Fade to `theme-gameplay` (loop) on scene start | Update net SFX to use `playRandom(['bark', 'net-call'])`. Add `sfx-kitty-defeat` on enemy stomp |
| **GameScene** (level 2 boss) | Switch to `theme-boss` when boss spawns | Add `sfx-boss-defeat` when Humdinger HP reaches 0 |
| **VictoryScene** | Fade to `theme-victory` (play once) → crossfade into `theme-title` | Keep existing victory arpeggio or replace |
| **NameEntryScene** | Continue `theme-title` from victory transition | Keep tick SFX |
| **LeaderboardScene** | Continue `theme-title` | None |

### Key Implementation Details

1. **Music transitions:** Use 500ms crossfades between tracks to avoid jarring cuts
2. **Boss music trigger:** In `GameScene.js`, when boss enters (around line 470-490), fade gameplay → boss music
3. **Level-to-level:** Keep gameplay music playing continuously between levels (don't restart)
4. **Victory → Title loop:** Victory track plays once, then `theme-title` fades in and continues through NameEntry and Leaderboard
5. **Volume levels:** Music at 0.3-0.4, SFX at 0.5-0.7 (SFX should punch through music)

---

## Implementation Order (What I'll Code)

Once you provide the audio files:

- [x] **Step 1:** Create `feature/sound-design` branch
- [x] **Step 2:** Build `AudioManager.js` with crossfade, mobile/desktop support
- [x] **Step 3:** Update `SFX.js` to support file-based sounds + `playRandom()`
- [x] **Step 4:** Update `PreloadScene.js` to load all new audio assets
- [x] **Step 5:** Update `main.js` to initialize AudioManager
- [x] **Step 6:** Wire MenuScene → `theme-title`
- [x] **Step 7:** Wire StoryScene → `theme-story`
- [x] **Step 8:** Wire GameScene → `theme-gameplay` + boss music switch + new SFX triggers
- [x] **Step 9:** Wire VictoryScene → `theme-victory` → `theme-title` continuation
- [ ] **Step 10:** Test all transitions, verify mobile playback, check iOS silent switch behavior
- [ ] **Step 11:** You test everything, we iterate
- [ ] **Step 12:** Merge to main

---

## File Naming Convention

```
public/assets/audio/
├── theme-title.mp3        # Title/menu screen music
├── theme-story.mp3        # Story cutscene music
├── theme-gameplay.mp3     # Main gameplay music (or keep theme.mp3)
├── theme-boss.mp3         # Boss battle music
├── theme-victory.mp3      # Victory fanfare
├── sfx-bark.wav           # Chase bark
├── sfx-net-call.wav       # Chase "net!" call
├── sfx-kitty-defeat.wav   # Angry meow
├── sfx-boss-defeat.wav    # Humdinger groan
└── theme.mp3              # (existing — keep as fallback or rename to theme-gameplay.mp3)
```

---

## Questions for You Before Starting

1. **Gameplay theme:** Keep current `theme.mp3` as the gameplay track, or generate a new one?
2. **Paw Patrol theme licensing:** The Suno-generated title theme won't be the actual Paw Patrol theme — it'll be an 8-bit "inspired by" track. Is that okay, or do you want to try downloading the actual theme from YouTube?
3. **Victory flow:** Should `theme-victory` play the full fanfare then seamlessly loop into `theme-title`? Or just play the fanfare once and cut to title music?

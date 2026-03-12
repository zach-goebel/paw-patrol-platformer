# Arcade-Style Leaderboard System

## Enhancement Summary

**Deepened on:** 2026-03-11
**Sections enhanced:** 7
**Research agents used:** Security Sentinel, Performance Oracle, Architecture Strategist, Frontend Races Reviewer, Spec Flow Analyzer, Code Simplicity Reviewer, Phaser Docs Researcher, Frontend Designer, Upstash/Vercel Best Practices Researcher

### Key Improvements
1. **Redis data model simplified** — JSON-encode all data in sorted set member string, eliminating separate hash storage. Pipeline all commands (GET latency: 600ms → 15ms).
2. **Race condition protection** — Liveness flags on all fetch callbacks, scene-level `_transitioning` locks, 200ms input cooldown, and `finally()` for post-fetch transitions.
3. **Mobile name entry redesigned** — No up/down buttons exist on controller bar. Solution: left/right cycle letters, Jump confirms, Net backspaces. Two-step submit safeguard prevents accidental toddler submission.
4. **Timer uses Phaser's clock** — `update(time, delta)` accumulator instead of Date.now(), pauses when tab is backgrounded.
5. **Security hardened** — @upstash/ratelimit instead of in-memory (which doesn't work on serverless), input validation with time floor, CORS headers, body size limit.

### New Considerations Discovered
- POST response should return updated leaderboard data (eliminates second GET)
- Sorted sets must be trimmed on write to prevent unbounded growth
- Pass final stats as scene data, NOT via GameState (which gets reset in MenuScene)
- Don't expand controller event system — use direct DOM listeners (same pattern as GameScene)
- Add `.env` to `.gitignore` before creating any credentials
- Empty leaderboard needs a friendly state ("No scores yet!")
- Auto-submit timeout (60s) for abandoned name entry
- Context-sensitive exit button: "PLAY AGAIN" after game, "BACK" from menu

---

## Overview

Add a shared, persistent leaderboard to the Paw Patrol platformer with retro arcade aesthetics. Players enter their name after beating the game, scores are stored in Upstash Redis via Vercel Serverless Functions, and a rotating leaderboard display shows top-20 rankings across three categories.

## Architecture

```
Browser (Phaser 3)                    Vercel
┌──────────────────┐          ┌─────────────────────┐
│ NameEntryScene   │──POST──→ │ api/scores.js       │
│ LeaderboardScene │──GET───→ │   └→ Upstash Redis  │
│ MenuScene        │──GET───→ │      (Sorted Sets)  │
└──────────────────┘          └─────────────────────┘
```

**Backend: Upstash Redis** (free tier: 256MB storage, 500K commands/month)
- Redis Sorted Sets are purpose-built for leaderboards
- Three sorted sets: `lb:time`, `lb:treats`, `lb:kitties`
- All player data JSON-encoded in the sorted set member string (no separate hashes)
- Vercel Serverless Functions in `/api` directory (auto-detected by Vercel)

### Research Insights: Architecture

**Data model — JSON member strings (eliminates hashes):**
Instead of storing player data in separate Redis hashes, encode everything in the sorted set member:
```js
const member = JSON.stringify({
  name: "CHASE",
  treats: 38,
  kitties: 14,
  time: 142,
  ts: Date.now()  // makes each entry unique
});
await redis.zadd("lb:time", { score: 142, member });
```
This eliminates all hash lookups. One pipeline call, 3 commands, 1 HTTP round trip. GET latency drops from ~600ms to ~15ms.

**Utility module — keep fetch logic out of scenes:**
Create `/src/utils/LeaderboardAPI.js` (mirrors existing `/src/utils/SFX.js` pattern) to centralize API URL and fetch logic. Scenes depend on the utility, not raw fetch calls.

**vercel.json required for SPA + API coexistence:**
```json
{
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

**Scene data flow — pass stats via `scene.start()`, not GameState:**
MenuScene calls `state.reset()` on play tap. If NameEntryScene or LeaderboardScene reads from GameState, values may already be reset. Always pass `{ time, treats, kitties }` as scene start data.

## Scene Flow Changes

```
Current:
  GameScene (Level 2) → VictoryScene → MenuScene

New:
  GameScene (Level 2) → VictoryScene (3s celebration, auto-advance)
                            → NameEntryScene
                                → LeaderboardScene → MenuScene

  MenuScene also has a "LEADERBOARD" button → LeaderboardScene → MenuScene
```

### Research Insights: Scene Flow

**VictoryScene auto-advances (no tap needed):**
After 3s celebration, auto-transition to NameEntryScene. Remove the 20-second auto-return timer. Toddlers shouldn't need to find and tap a button after beating the game.

**Auto-submit timeout on NameEntryScene:**
If no input for 60 seconds, auto-submit with current name (or default "PUP" if empty). Toddlers frequently abandon devices mid-interaction.

**Context-sensitive exit button on LeaderboardScene:**
- From NameEntryScene (post-game): button says "PLAY AGAIN"
- From MenuScene (browsing): button says "BACK"
- Pass `{ fromMenu: true/false }` in scene data to determine label.

---

## Implementation Phases

---

### Phase 1: Backend — Upstash Redis + Vercel Functions

**Setup:**
1. Add `.env` and `.env.local` to `.gitignore` FIRST (before creating any credentials)
2. Create free Upstash Redis database at console.upstash.com (or via Vercel Marketplace integration)
3. Add environment variables to Vercel project:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Install dependencies: `npm install @upstash/redis @upstash/ratelimit`

**Files to create:**

#### `api/scores.js` — Single serverless function

```
GET  /api/scores              → returns all three leaderboards (top 20 each)
POST /api/scores              → submits a new score entry, returns updated leaderboards
```

**GET response shape:**
```json
{
  "time":    [{ "name": "CHASE", "time": 142, "treats": 38, "kitties": 14, "rank": 1 }, ...],
  "treats":  [{ "name": "SKYE",  "time": 200, "treats": 38, "kitties": 10, "rank": 1 }, ...],
  "kitties": [{ "name": "ROCKY", "time": 180, "treats": 30, "kitties": 14, "rank": 1 }, ...]
}
```

**POST body shape:**
```json
{
  "name": "CHASE",
  "time": 142,
  "treats": 38,
  "kitties": 14
}
```

**POST response: returns updated leaderboard data** (same shape as GET). This eliminates a second API call — NameEntryScene passes the response directly to LeaderboardScene.

**Redis data model:**
- `lb:time` — Sorted Set, score = total seconds (ascending = best, use `rev: false`)
- `lb:treats` — Sorted Set, score = treats collected (descending = best, use `rev: true`)
- `lb:kitties` — Sorted Set, score = kitties caught (descending = best, use `rev: true`)
- Member string: `JSON.stringify({ name, time, treats, kitties, ts })` — ts makes each entry unique
- **Trim on write:** After each ZADD, run `ZREMRANGEBYRANK` to keep only top 100 entries per set. This bounds storage permanently.

**Pipeline all Redis commands:**
```js
// GET: 1 pipeline, 3 commands, 1 HTTP round trip
const pipe = redis.pipeline();
pipe.zrange('lb:time', 0, 19, { withScores: true });
pipe.zrange('lb:treats', 0, 19, { rev: true, withScores: true });
pipe.zrange('lb:kitties', 0, 19, { rev: true, withScores: true });
const [timeEntries, treatEntries, kittyEntries] = await pipe.exec();

// POST: 1 pipeline, 6 commands (3 ZADD + 3 ZREMRANGEBYRANK), 1 round trip
const pipe = redis.pipeline();
pipe.zadd('lb:time', { score: time, member });
pipe.zremrangebyrank('lb:time', 100, -1);      // keep lowest 100 times
pipe.zadd('lb:treats', { score: treats, member });
pipe.zremrangebyrank('lb:treats', 0, -101);     // keep highest 100 treat counts
pipe.zadd('lb:kitties', { score: kitties, member });
pipe.zremrangebyrank('lb:kitties', 0, -101);    // keep highest 100 kitty counts
await pipe.exec();
```

### Research Insights: Backend Security & Performance

**Rate limiting — use @upstash/ratelimit, NOT in-memory:**
In-memory rate limiting does not work on Vercel serverless (stateless, containers recycled). Use `@upstash/ratelimit` with your existing Redis instance:
```js
import { Ratelimit } from "@upstash/ratelimit";
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, "60 s"),
  ephemeralCache: new Map(),
});
const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
const { success } = await ratelimit.limit(ip);
if (!success) return new Response('{"error":"Too fast"}', { status: 429 });
```

**Validation (server-side) — tightened from original plan:**
```js
function validate({ name, time, treats, kitties }) {
  if (typeof name !== 'string' || !/^[A-Z ]{1,10}$/.test(name)) return false;
  if (!Number.isInteger(time) || time < 30 || time > 3600) return false;   // 30s min, 1hr max
  if (!Number.isInteger(treats) || treats < 0 || treats > 38) return false;
  if (!Number.isInteger(kitties) || kitties < 0 || kitties > 14) return false;
  return true;
}
```
- Time floor of 30 seconds (3 levels cannot be completed faster)
- Type checks with `Number.isInteger()`
- Name regex matches A-Z + space only (matches client-side character set)

**Body size limit — reject before parsing:**
```js
const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
if (contentLength > 512) return new Response('{"error":"Too large"}', { status: 413 });
```

**CORS headers — same-origin is fine in production, add for local dev:**
```js
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
```

**Redis client at module scope (reused across warm invocations):**
```js
const redis = Redis.fromEnv();  // top of file, outside handler
```

**Named HTTP method exports (current Vercel pattern):**
```js
export async function GET(request) { ... }
export async function POST(request) { ... }
export async function OPTIONS() { return new Response(null, { status: 200, headers: corsHeaders }); }
```

**Client-side guard — prevent double submission:**
In NameEntryScene, set `this._hasSubmitted = true` after first POST. This is a belt-and-suspenders addition to server-side rate limiting.

---

### Phase 2: Track Game Time

**File: `src/config/GameState.js`**

Add time tracking using accumulated delta (Phaser-clock-aware):
```js
// New fields in INITIAL_STATE:
_levelStartElapsed: 0,  // scene elapsed at level start
totalTimeMs: 0,         // accumulated across levels

// New methods:
startLevelTimer()       // called at start of each level's create()
accumulateTime(elapsed) // called at level exit, adds elapsed to totalTimeMs
getTotalSeconds()       // returns Math.floor(totalTimeMs / 1000)
```

**File: `src/scenes/GameScene.js`**

- In `create()`: `this._sceneStartTime = 0;` (will use delta accumulator)
- In `update(time, delta)`: `this._sceneElapsed = (this._sceneElapsed || 0) + delta;`
- In `reachExit()` / `onReachSkye()`: `state.accumulateTime(this._sceneElapsed);`
- Pass final stats as scene data to VictoryScene: `{ time: state.getTotalSeconds(), treats: state.treatsCollected, kitties: state.kittiesCaptured }`

**File: `src/scenes/UIScene.js`**

- Add timer display in top-right area
- Format: `MM:SS` — updates every second via `this.time.addEvent({ delay: 1000, loop: true })`
- Reads accumulated time from GameState + current scene elapsed

### Research Insights: Timer

**Use Phaser's delta accumulator, NOT Date.now():**
- `Date.now()` keeps running when the tab is backgrounded, unfairly inflating completion times.
- Phaser's `update(time, delta)` automatically pauses when `requestAnimationFrame` stops (tab backgrounded).
- The accumulation pattern (`totalTimeMs += sceneElapsed`) works correctly across the three-level sequence where GameScene is restarted between levels.

**Don't overwrite on scene restart:**
GameScene restarts for each level. Each restart creates a new `_sceneElapsed` counter. Call `state.accumulateTime()` before transitioning to preserve elapsed time.

---

### Phase 3: Name Entry Scene (Arcade Style)

**File to create: `src/scenes/NameEntryScene.js`**

Classic arcade "ENTER YOUR NAME" screen with character-by-character selection.

**Visual layout (800x480 canvas):**
```
┌──────────────────────────────────┐
│      (scanline overlay)          │
│                                  │
│     ★ ENTER YOUR NAME ★         │  40px gold, shadow glow
│                                  │
│     [C] [H] [A] [ ] [ ] [ ]     │  64px slots, 6 max
│      ↑                           │  active slot pulses
│                                  │
│     Time: 2:22  Treats: 38      │  player stats summary
│     Kitties: 14                  │
│                                  │
│     [ O K ]      [ DEL ]        │  gold / red buttons
│                                  │
│     ◀ ▶ = change letter          │  hint text for parents
└──────────────────────────────────┘
```

**Character set:** `A-Z` + `SPACE` (27 characters, wrapping). Simplified from 37 — numbers add cycling tedium with no value for a toddler game.

**Max name length:** 6 characters (not 10). Shorter = less tedious for toddlers/parents cycling through letters. Still plenty for names like "CHASE", "SKYE", "MOM", "DAD".

**Desktop controls:**
- Up/Down arrows: cycle through characters at current position
- Right arrow: confirm current character, advance to next slot
- Left arrow or Backspace: go back one slot
- Enter: move to OK button / submit

**Mobile controls (NO up/down buttons exist on controller bar):**
- Left/Right d-pad buttons: cycle through letters (left = previous, right = next)
- Jump button (red): confirm current letter, advance to next slot
- Net button (blue): backspace / delete last letter
- These use **direct DOM event listeners** on the controller buttons (same pattern as GameScene's `createTouchControls()`), NOT new game events

**Two-step submit safeguard (prevents accidental toddler submission):**
When all slots are filled (or user is done), Jump button moves focus to the "OK" button. One more Jump press submits. This prevents the toddler from accidentally submitting by mashing Jump (which they are conditioned to do from gameplay).

**Auto-submit timeout:**
If no input for 60 seconds, auto-submit with current name. If name is empty/blank, default to "PUP".

### Research Insights: Name Entry

**Input cooldown — 200ms debounce:**
Toddlers palm-mash the screen. Without debouncing, a single slap registers 3-5 touch events in one frame, skipping multiple letters:
```js
onLetterChange(direction) {
  const now = this.time.now;
  if (now - (this._lastInputTime || 0) < 200) return;
  this._lastInputTime = now;
  // cycle letter
}
```

**Don't expand the controller event system:**
The architecture review and races review both agree: don't add `controller-up`, `controller-down`, etc. to `game.events`. Instead, attach direct DOM `touchstart`/`touchend` listeners to the controller buttons within NameEntryScene, exactly as GameScene already does. Clean them up in `shutdown()`.

**Fetch race condition — guard with liveness flag:**
```js
this._alive = true;
this.events.once('shutdown', () => { this._alive = false; });

fetch('/api/scores', { method: 'POST', body: JSON.stringify(payload) })
  .then(res => res.json())
  .catch(() => null)
  .finally(boards => {
    if (!this._alive) return;  // scene destroyed during fetch
    this.scene.start('LeaderboardScene', { boards, playerName, fromMenu: false });
  });
```

**Styling — "Neon Arcade Toybox":**
- Background: deep purple-black `0x1a0e2e`
- Title: gold `#ffd700`, 40px monospace, with shadow glow (blur: 15, padding: { x: 20, y: 10 })
- Active slot: cyan `#00ffff` with scale pulse (1.0 → 1.15, 500ms, yoyo)
- Inactive slots: muted lavender `#8b7daa`
- OK button: gold fill `0xffd700`, dark text
- DEL button: red fill `0xe74c3c`, white text
- Scanline overlay: Graphics, horizontal lines every 4px, `fillRect` at alpha 0.08, depth 1000
- Character cycling animation: letter slides out (y ± 30, alpha → 0, 80ms) while new letter slides in

**Sound — throttled tick on letter change:**
```js
case 'tick': this._tone(t, 600, 600, 0.03, 0.08); break;
```
Throttle to max once per 150ms to avoid AudioNode accumulation on rapid cycling.

**Scene data received from VictoryScene:**
```js
this.scene.start('NameEntryScene', {
  time: totalSeconds,
  treats: treatsCollected,
  kitties: kittiesCaptured
});
```

---

### Phase 4: Leaderboard Display Scene

**File to create: `src/scenes/LeaderboardScene.js`**

Rotating display cycling through three top-20 leaderboards.

**Three boards:**
1. **TOP TIMES** — sorted by time ascending (lowest = best), accent color: cyan `#00ffff`
2. **TOP TREATS** — sorted by treats descending (most = best), accent color: gold `#ffd700`
3. **TOP KITTIES** — sorted by kitties descending (most = best), accent color: pink `#ff69b4`

**Visual layout (800x480 canvas, per board):**
```
┌──────────────────────────────────┐
│  (scanline overlay)              │
│  [◀]  ★ TOP TIMES ★  [▶]  1/3  │  36px, board accent color
│  ══════════════════════════      │  double line separator
│  RNK   NAME      TIME           │  18px column headers
│  ──────────────────────────      │
│   1.   CHASE     1:42   ←YOU    │  gold text for rank 1
│   2.   MARSHALL  2:05           │  silver for rank 2
│   3.   SKYE      2:18           │  bronze for rank 3
│   4.   ROCKY     2:45           │  white for 4-10
│   ...                            │
│  20.   RUBBLE    8:44           │  dim lavender for 11-20
│                                  │
│  ● ○ ○    [PLAY AGAIN]          │  page dots + exit button
└──────────────────────────────────┘
```

**Navigation:**
- Desktop: Left/Right arrows to switch boards, Enter/Space to return to menu
- Mobile: Swipe left/right (min 50px horizontal, <300ms, <30px vertical deviation) OR left/right controller buttons to switch boards. Any other controller button returns to menu.
- Auto-rotate every 5 seconds if no input. Manual navigation resets the timer.

**Board transition animation:**
- Current board slides out (x offset ±800px, alpha → 0, 300ms, ease `Power2.easeIn`)
- New board slides in from opposite side (300ms, ease `Power2.easeOut`)
- Use containers to group all elements per board

**Current player highlight:**
- If `playerName` is provided (came from NameEntryScene), highlight their row with accent-colored background rectangle pulsing alpha 0.08 → 0.2
- Add "←YOU" marker in accent color

**Empty leaderboard state:**
Show "NO SCORES YET!" in gold with bouncing Paw Patrol characters. Friendly, not broken-looking.

**Data fetching:**
- From NameEntryScene: boards already included in POST response (passed via scene data)
- From MenuScene: fetch `GET /api/scores` on scene create, show "LOADING..." with blinking dots

### Research Insights: Leaderboard Display

**Tween cleanup with liveness flag:**
```js
create(data) {
  this._alive = true;
  this.events.once('shutdown', () => { this._alive = false; });
  // ...
}
```
Guard all `onComplete` callbacks and fetch `.then()` handlers with `if (!this._alive) return;`

**Auto-rotate: chain delayedCall, don't use repeating timer:**
```js
scheduleAutoRotate() {
  if (this._autoTimer) this._autoTimer.remove(false);
  this._autoTimer = this.time.delayedCall(5000, () => {
    this.showNextBoard();
    this.scheduleAutoRotate();  // chain, not loop
  });
}
```
Manual navigation calls `scheduleAutoRotate()` to reset the timer.

**Destroy off-screen containers in slide-out onComplete:**
```js
this.tweens.add({
  targets: oldContainer,
  x: -GAME_WIDTH,
  alpha: 0,
  duration: 300,
  ease: 'Power2',
  onComplete: () => {
    if (this._alive) oldContainer.destroy();
  }
});
```

**Kill tweens before re-tweening same target:**
```js
this.tweens.killTweensOf(target);
// then start new tween
```

**Swipe detection (Phaser pointer events):**
```js
this.input.on('pointerdown', (pointer) => {
  this._swipeStart = { x: pointer.x, time: pointer.downTime };
});
this.input.on('pointerup', (pointer) => {
  if (!this._swipeStart) return;
  const dx = pointer.x - this._swipeStart.x;
  const dt = pointer.upTime - this._swipeStart.time;
  if (dt < 300 && Math.abs(dx) > 50) {
    dx > 0 ? this.showPrevBoard() : this.showNextBoard();
  }
  this._swipeStart = null;
});
```

**Scene-level transition lock:**
Use `this._transitioning = false` and guard all interactive handlers. Prevents race between leaderboard button, play-again button, and auto-rotate during fade-out.

**Staggered row entrance animation:**
Rows appear one at a time, 30ms stagger, fading in + sliding from x-20 to final x. Total: ~600ms for 20 rows. Adds polish without blocking interaction.

**Row text sizing for 20 entries in 800x480:**
- Each row: 16px text, 19px line height
- 20 rows × 19px = 380px, fitting comfortably with header and footer
- Right-align score values with `setOrigin(1, 0.5)`

**Color ranking:**
- Rank 1: gold `#ffd700`
- Rank 2: silver `#c0c0c0`
- Rank 3: bronze `#cd7f32`
- Ranks 4-10: white `#ffffff`
- Ranks 11-20: dim lavender `#8888aa`

---

### Phase 5: Wire Everything Together

**File changes:**

#### `src/scenes/VictoryScene.js`
- After 3-second celebration, auto-transition to `NameEntryScene` (no button press needed)
- Pass score data: `{ time, treats, kitties }` from GameState (read before any reset)
- Remove the play-again button and 20-second auto-return timer
- Keep fireworks running during the 3-second celebration

#### `src/scenes/MenuScene.js`
- Add a "LEADERBOARD" button below the play button (text-based, smaller)
- Add scene-level `_transitioning` flag to prevent race between Play and Leaderboard buttons:
  ```js
  create() {
    this._transitioning = false;
    // ...
  }
  onPlayTap() {
    if (this._transitioning) return;
    this._transitioning = true;
    // existing logic...
  }
  onLeaderboardTap() {
    if (this._transitioning) return;
    this._transitioning = true;
    // fetch, then transition
  }
  ```
- Leaderboard button: fetches GET /api/scores, shows brief loading indicator, then transitions to `LeaderboardScene` with `{ boards, fromMenu: true }`
- Guard the fetch callback with a check that the scene hasn't transitioned away

#### `src/main.js`
- Add `NameEntryScene` and `LeaderboardScene` to the scene array
- Do NOT add new controller events — keep existing `controller-press` for menu navigation

#### `src/utils/LeaderboardAPI.js` (new utility)
- `submitScore(name, time, treats, kitties)` → POST, returns boards
- `getScores()` → GET, returns boards
- Centralizes API URL and error handling
- Both methods return `null` on failure (graceful degradation)

#### `src/config/constants.js`
- No changes needed (API URL is relative `/api/scores`)

#### `package.json`
- Add dependencies: `@upstash/redis`, `@upstash/ratelimit`

#### `vercel.json` (new)
```json
{
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

#### `.gitignore`
- Add `.env` and `.env.local` before creating any credential files

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `api/scores.js` | Create | Serverless function: GET/POST leaderboard, rate limiting, validation |
| `src/scenes/NameEntryScene.js` | Create | Arcade-style name entry (A-Z, 6 chars, 2-step submit) |
| `src/scenes/LeaderboardScene.js` | Create | Rotating 3-board leaderboard with slide transitions |
| `src/utils/LeaderboardAPI.js` | Create | Fetch wrapper for score submission and retrieval |
| `vercel.json` | Create | SPA rewrite rules for API coexistence |
| `src/config/GameState.js` | Modify | Add delta-based timer (accumulateTime, getTotalSeconds) |
| `src/scenes/GameScene.js` | Modify | Accumulate scene elapsed time, pass stats as scene data |
| `src/scenes/UIScene.js` | Modify | Add MM:SS timer display to HUD |
| `src/scenes/VictoryScene.js` | Modify | Auto-transition to NameEntryScene after 3s celebration |
| `src/scenes/MenuScene.js` | Modify | Add leaderboard button, _transitioning lock |
| `src/main.js` | Modify | Register new scenes |
| `src/utils/SFX.js` | Modify | Add 'tick' sound for letter cycling |
| `package.json` | Modify | Add @upstash/redis, @upstash/ratelimit |
| `.gitignore` | Modify | Add .env, .env.local |

## Implementation Order

1. **Phase 1** — Backend (Upstash + API function + vercel.json + .gitignore) — test with curl
2. **Phase 2** — Timer tracking in GameState + HUD display — small, isolated change
3. **Phase 3** — NameEntryScene + LeaderboardAPI utility — needs controller DOM listeners
4. **Phase 4** — LeaderboardScene — needs data from API
5. **Phase 5** — Wire scenes (VictoryScene → NameEntry → Leaderboard → Menu, plus Menu → Leaderboard)

## Acceptance Criteria

- [ ] After beating the game, player enters their name arcade-style (A-Z letter cycling, 6 chars max)
- [ ] Name entry works on both desktop (keyboard) and mobile (controller buttons via DOM listeners)
- [ ] Two-step submit prevents accidental toddler submission
- [ ] Auto-submit after 60s of inactivity (defaults to "PUP" if empty)
- [ ] Score is submitted to shared Upstash Redis leaderboard via serverless API
- [ ] POST response returns updated leaderboard (no second GET needed)
- [ ] Server-side validation rejects invalid scores (time floor 30s, max bounds)
- [ ] Rate limiting via @upstash/ratelimit (3 per 60s per IP)
- [ ] Leaderboard shows top 20 across three categories (time, treats, kitties)
- [ ] Leaderboard auto-rotates every 5s, supports manual navigation (arrows/swipe)
- [ ] Manual navigation resets auto-rotate timer
- [ ] Current player's position is highlighted on each board
- [ ] Empty leaderboard shows friendly "NO SCORES YET!" state
- [ ] Leaderboard is accessible from the title screen (with loading indicator)
- [ ] Context-sensitive exit button ("PLAY AGAIN" vs "BACK")
- [ ] Timer runs during gameplay using Phaser delta accumulator (pauses when tab backgrounded)
- [ ] Timer displayed as MM:SS in HUD
- [ ] All styling matches retro arcade aesthetic (deep purple-black, gold/cyan accents, scanlines)
- [ ] All fetch callbacks guarded with liveness flags (no zombie scene updates)
- [ ] Scene-level _transitioning locks prevent race conditions
- [ ] Desktop experience unchanged (no mobile controls shown)
- [ ] Mobile controller buttons work for name entry (left/right cycle, jump confirms, net backspaces)
- [ ] 200ms input cooldown on name entry to handle toddler button mashing
- [ ] Sorted sets trimmed to top 100 on each write (bounded growth)

# Plan: Mobile-Only Fixes — Controller Bar, Jump Fix, Landscape Fit

## Problem

Three mobile issues (desktop must stay untouched):

1. **Touch controls overlay gameplay** — buttons sit on top of the game canvas at depth 100, obscuring platforms and enemies at the bottom of the screen.
2. **Touch jump is broken** — Chase can't reach platforms and double jump doesn't work. Root cause identified below.
3. **Landscape clipping** — the game canvas fills the viewport via `Phaser.Scale.FIT` + `CENTER_BOTH`, leaving no room for controls and getting cut off on short viewports.

## Analysis

### Jump Bug Root Cause

The variable-height jump logic in `update()` (line 989-992):
```js
if ((this.cursors.up.isUp && this.spaceKey.isUp && !this.touchIntent.jump) &&
    player.body.velocity.y < 0) {
  player.setVelocityY(player.body.velocity.y * 0.85);
}
```

**Keyboard**: `this.cursors.up.isUp` is `false` while the key is held down. Player gets full jump height by holding the key.

**Touch**: `this.touchIntent.jump` is reset to `false` **every frame** in the touch input block (line 953: `this.touchIntent.jump = false`). So `!this.touchIntent.jump` is `true` on virtually every frame during ascent. The 0.85 damping fires every frame, killing upward velocity almost immediately. Touch jumps reach ~20% of keyboard jump height.

This is the entire jump problem — the damping logic was written for keyboard (held key = full jump, release = short jump) but touch resets the flag immediately.

### Controller Bar Approach

Instead of Phaser game objects overlaid on the canvas, create an HTML div below the canvas with styled buttons. This:
- Keeps controls out of the gameplay area entirely
- Allows CSS styling for a gamepad look
- Lets us size the canvas + bar together to fit the viewport
- Doesn't interfere with Phaser's rendering at all

## Fix: Three changes

### Change 1: HTML Controller Bar (mobile only)

**In `src/main.js`:**

After creating the Phaser game, detect touch and inject the controller bar HTML below the canvas.

```js
// After: const game = new Phaser.Game(config);

const isTouchDevice = (() => {
  const primaryIsCoarse = window.matchMedia('(pointer: coarse)').matches;
  const cannotHover = window.matchMedia('(hover: none)').matches;
  const hasTouchPoints = navigator.maxTouchPoints > 0;
  const anyCoarse = window.matchMedia('(any-pointer: coarse)').matches;
  return (primaryIsCoarse && cannotHover) ||
    (anyCoarse && hasTouchPoints && window.innerWidth <= 1024);
})();

if (isTouchDevice) {
  // Wrap canvas in a container for layout control
  const canvas = document.querySelector('canvas');
  const wrapper = document.createElement('div');
  wrapper.id = 'game-wrapper';
  canvas.parentNode.insertBefore(wrapper, canvas);
  wrapper.appendChild(canvas);

  // Controller bar
  const bar = document.createElement('div');
  bar.id = 'controller-bar';
  bar.innerHTML = `
    <div class="dpad">
      <button id="btn-left" aria-label="Left">◀</button>
      <button id="btn-right" aria-label="Right">▶</button>
    </div>
    <div class="actions">
      <button id="btn-net" aria-label="Net">🕸</button>
      <button id="btn-jump" aria-label="Jump">▲</button>
    </div>
  `;
  wrapper.appendChild(bar);

  // Store button references on the game registry for GameScene to read
  game.registry.set('touchButtons', {
    left: document.getElementById('btn-left'),
    right: document.getElementById('btn-right'),
    jump: document.getElementById('btn-jump'),
    net: document.getElementById('btn-net'),
  });
}
```

**In `index.html`:** Add CSS for the controller bar and wrapper layout:

```css
#game-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-height: 100vh;
  max-height: 100dvh;
}

#game-wrapper canvas {
  flex-shrink: 1;
  max-width: 100%;
}

#controller-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: 800px;
  padding: 8px 16px;
  box-sizing: border-box;
  background: #1a1a2e;
  border-top: 2px solid #333;
  flex-shrink: 0;
}

#controller-bar .dpad,
#controller-bar .actions {
  display: flex;
  gap: 12px;
}

#controller-bar button {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 2px solid #555;
  background: #2a2a4a;
  color: #fff;
  font-size: 24px;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  cursor: pointer;
}

#controller-bar button:active {
  background: #4a4a8a;
  border-color: #88f;
}

#controller-bar #btn-jump {
  background: #c0392b;
  border-color: #e74c3c;
}

#controller-bar #btn-jump:active {
  background: #e74c3c;
}

#controller-bar #btn-net {
  background: #2e86c1;
  border-color: #3498db;
}

#controller-bar #btn-net:active {
  background: #3498db;
}
```

### Change 2: Rewire Touch Input in GameScene

**In `GameScene.js` `createTouchControls()`:** Replace the Phaser-based button creation with DOM event listeners on the HTML buttons.

```js
createTouchControls() {
  const buttons = this.registry.get('touchButtons');
  if (!buttons) return;

  // Track whether jump button is currently held
  this._jumpHeld = false;

  // D-pad
  buttons.left.addEventListener('touchstart', (e) => { e.preventDefault(); this.touchIntent.left = true; });
  buttons.left.addEventListener('touchend', () => { this.touchIntent.left = false; });
  buttons.left.addEventListener('touchcancel', () => { this.touchIntent.left = false; });

  buttons.right.addEventListener('touchstart', (e) => { e.preventDefault(); this.touchIntent.right = true; });
  buttons.right.addEventListener('touchend', () => { this.touchIntent.right = false; });
  buttons.right.addEventListener('touchcancel', () => { this.touchIntent.right = false; });

  // Jump — track held state separately for variable-height jump
  buttons.jump.addEventListener('touchstart', (e) => { e.preventDefault(); this.touchIntent.jump = true; this._jumpHeld = true; });
  buttons.jump.addEventListener('touchend', () => { this._jumpHeld = false; });
  buttons.jump.addEventListener('touchcancel', () => { this._jumpHeld = false; });

  // Net
  buttons.net.addEventListener('touchstart', (e) => { e.preventDefault(); this.touchIntent.net = true; });
  buttons.net.addEventListener('touchend', () => {});
  buttons.net.addEventListener('touchcancel', () => {});
}
```

Key difference: `_jumpHeld` stays `true` as long as the finger is on the jump button, matching keyboard behavior where `cursors.up.isDown` stays true while held.

### Change 3: Fix Variable-Height Jump for Touch

**In `update()`**, change the variable-height jump damping check:

```js
// Current (broken for touch):
if ((this.cursors.up.isUp && this.spaceKey.isUp && !this.touchIntent.jump) &&
    player.body.velocity.y < 0) {

// Fixed:
const jumpReleased = this.cursors.up.isUp && this.spaceKey.isUp && !this._jumpHeld;
if (jumpReleased && player.body.velocity.y < 0) {
```

`this._jumpHeld` is `true` while the jump button is held → damping doesn't fire → full jump height. When released → damping fires → variable-height short hop. Same behavior as keyboard.

Initialize `this._jumpHeld = false` in `init()` so it exists even on desktop (where it stays false and doesn't affect keyboard logic).

### Change 4: Landscape Viewport Fit

**In `src/main.js`:** Change Phaser's scale mode so it doesn't fill the full viewport on touch devices. Instead, let the CSS wrapper control sizing.

```js
// In the game config, before creating the game:
const scaleConfig = isTouchDevice
  ? { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY }
  : { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH };
```

Wait — `isTouchDevice` is evaluated after game creation in the current plan. Restructure: detect touch first, then build config.

**Revised approach for `src/main.js`:**

```js
const isTouchDevice = (() => { /* detection logic */ })();

const config = {
  // ... existing config ...
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: isTouchDevice
      ? Phaser.Scale.CENTER_HORIZONTALLY
      : Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  // ...
};

const game = new Phaser.Game(config);

if (isTouchDevice) {
  // ... wrapper + controller bar injection ...
}
```

**CSS for landscape fit:**

```css
#game-wrapper {
  max-height: 100vh;
  max-height: 100dvh;  /* dynamic viewport height — excludes mobile browser chrome */
}

#game-wrapper canvas {
  flex-shrink: 1;       /* canvas shrinks to make room for controller bar */
  min-height: 0;        /* allow flexbox to shrink below intrinsic size */
}

#controller-bar {
  flex-shrink: 0;       /* controller bar never shrinks */
}
```

This ensures: canvas height + bar height = viewport height. The canvas shrinks as needed to fit both. In landscape, where vertical space is tight, the canvas gets smaller but the controller bar stays full size.

---

## Files Changed

- `index.html` — add controller bar CSS (inside `<style>` block)
- `src/main.js` — touch detection, wrapper/bar injection, conditional scale config
- `src/scenes/GameScene.js`:
  - `init()` — add `this._jumpHeld = false`
  - `createTouchControls()` — rewrite to use DOM buttons instead of Phaser game objects
  - `update()` — fix variable-height jump check to use `_jumpHeld`

## No Changes

- `constants.js` — no changes
- `PreloadScene.js` — touch button textures still generated (used by other scenes like TutorialScene), but GameScene no longer uses them for controls
- Desktop behavior — completely untouched (no wrapper, no bar, no DOM buttons, scale stays CENTER_BOTH)

## Risk

- **Low** — all changes gated behind `isTouchDevice` check
- Controller bar is pure HTML/CSS, no Phaser interaction
- `_jumpHeld` defaults to `false`, so desktop variable-height jump is unaffected
- Canvas flexbox shrinking is well-supported on mobile browsers

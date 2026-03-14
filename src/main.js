import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, GRAVITY } from './config/constants.js';
import GameState from './config/GameState.js';
import SFX from './utils/SFX.js';
import AudioManager from './utils/AudioManager.js';
import PreloadScene from './scenes/PreloadScene.js';
import BirthdaySplashScene from './scenes/BirthdaySplashScene.js';
import MenuScene from './scenes/MenuScene.js';
import TutorialScene from './scenes/TutorialScene.js';
import StoryScene from './scenes/StoryScene.js';
import GameScene from './scenes/GameScene.js';
import VictoryScene from './scenes/VictoryScene.js';
import NameEntryScene from './scenes/NameEntryScene.js';
import LeaderboardScene from './scenes/LeaderboardScene.js';
import UIScene from './scenes/UIScene.js';

// Detect touch device before creating the game
const isTouchDevice = (() => {
  const primaryIsCoarse = window.matchMedia('(pointer: coarse)').matches;
  const cannotHover = window.matchMedia('(hover: none)').matches;
  const hasTouchPoints = navigator.maxTouchPoints > 0;
  const anyCoarse = window.matchMedia('(any-pointer: coarse)').matches;
  return (primaryIsCoarse && cannotHover) ||
    (anyCoarse && hasTouchPoints && window.innerWidth <= 1024);
})();

// Mobile: create DOM structure BEFORE Phaser so it can use game-container as parent
let wrapper, leftPanel, rightPanel, bar, dpad, actions;
if (isTouchDevice) {
  wrapper = document.createElement('div');
  wrapper.id = 'game-wrapper';
  document.body.appendChild(wrapper);

  leftPanel = document.createElement('div');
  leftPanel.id = 'controller-left';
  leftPanel.className = 'controller-side';
  wrapper.appendChild(leftPanel);

  const gameContainer = document.createElement('div');
  gameContainer.id = 'game-container';
  wrapper.appendChild(gameContainer);

  rightPanel = document.createElement('div');
  rightPanel.id = 'controller-right';
  rightPanel.className = 'controller-side';
  wrapper.appendChild(rightPanel);

  bar = document.createElement('div');
  bar.id = 'controller-bar';
  bar.innerHTML = `
    <div class="dpad">
      <button id="btn-left" aria-label="Left">◀</button>
      <div class="dpad-divider"></div>
      <button id="btn-right" aria-label="Right">▶</button>
    </div>
    <div class="actions">
      <button id="btn-net" aria-label="Net">🕸<span class="btn-label">NET</span></button>
      <button id="btn-jump" aria-label="Jump">▲<span class="btn-label">JUMP</span></button>
    </div>
  `;
  wrapper.appendChild(bar);

  dpad = bar.querySelector('.dpad');
  actions = bar.querySelector('.actions');
}

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: GRAVITY },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: isTouchDevice
      ? Phaser.Scale.CENTER_HORIZONTALLY
      : Phaser.Scale.CENTER_BOTH,
    // On touch devices, render into the game-container so Phaser
    // measures the correct available space (between side panels)
    ...(isTouchDevice && { parent: 'game-container' }),
  },
  input: {
    activePointers: 3,
  },
  scene: [PreloadScene, BirthdaySplashScene, MenuScene, TutorialScene, StoryScene, GameScene, VictoryScene, NameEntryScene, LeaderboardScene, UIScene],
};

const game = new Phaser.Game(config);
game.registry.set('state', new GameState());
game.registry.set('isTouchDevice', isTouchDevice);

const sfx = new SFX();
game.registry.set('sfx', sfx);

// Initialize SFX with Phaser's managed AudioContext so sounds stay
// unlocked across scene transitions (fixes missing SFX on levels 1-2).
// File-based SFX decoding happens in PreloadScene.create() after assets load.
game.events.once('ready', () => {
  const phaserCtx = game.sound && game.sound.context;
  sfx.init(phaserCtx);

  // Initialize AudioManager for music (uses HTML5 Audio for all platforms)
  const audioManager = new AudioManager(game);
  game.registry.set('audioManager', audioManager);
});

// iOS audio unlock — must happen in a direct DOM touch handler (capture phase).
// iOS "ambient" audio session (used by Web Audio API) respects the silent switch.
// Playing through an HTML5 <audio> element activates the "playback" session
// which ignores the silent switch and also enables Web Audio output.
if (isTouchDevice) {
  function unlockAudio() {
    // Resume the Web Audio context for SFX
    const ctx = game.sound && game.sound.context;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
    sfx.resume();

    document.removeEventListener('touchstart', unlockAudio, true);
    document.removeEventListener('touchend', unlockAudio, true);
  }

  document.addEventListener('touchstart', unlockAudio, true);
  document.addEventListener('touchend', unlockAudio, true);
}

// Mobile: wire up controller events and orientation switching
if (isTouchDevice) {
  game.events.once('ready', () => {
    // Switch between portrait (bottom bar) and landscape (side panels) layouts
    function applyLayout(isLandscape) {
      if (isLandscape) {
        wrapper.classList.add('landscape');
        leftPanel.appendChild(dpad);
        rightPanel.appendChild(actions);
        game.scale.autoCenter = Phaser.Scale.NO_CENTER;
      } else {
        wrapper.classList.remove('landscape');
        bar.appendChild(dpad);
        bar.appendChild(actions);
        game.scale.autoCenter = Phaser.Scale.CENTER_HORIZONTALLY;
      }
      // Double rAF: first frame lets browser resolve flex layout,
      // second frame lets Phaser measure the final container dimensions
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          game.scale.resize(GAME_WIDTH, GAME_HEIGHT);
          game.scale.refresh();
        });
      });
    }

    const orientationQuery = window.matchMedia('(orientation: landscape)');
    orientationQuery.addEventListener('change', (e) => applyLayout(e.matches));
    applyLayout(orientationQuery.matches);

    game.registry.set('touchButtons', {
      left: document.getElementById('btn-left'),
      right: document.getElementById('btn-right'),
      jump: document.getElementById('btn-jump'),
      net: document.getElementById('btn-net'),
    });

    // Any controller button press emits 'controller-press' for menu navigation
    [bar, leftPanel, rightPanel].forEach((el) => {
      el.addEventListener('touchstart', () => {
        game.events.emit('controller-press');
      });
    });
  });
}

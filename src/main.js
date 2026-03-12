import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, GRAVITY } from './config/constants.js';
import GameState from './config/GameState.js';
import SFX from './utils/SFX.js';
import PreloadScene from './scenes/PreloadScene.js';
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
  },
  input: {
    activePointers: 3,
  },
  scene: [PreloadScene, MenuScene, TutorialScene, StoryScene, GameScene, VictoryScene, NameEntryScene, LeaderboardScene, UIScene],
};

const game = new Phaser.Game(config);
game.registry.set('state', new GameState());
game.registry.set('isTouchDevice', isTouchDevice);

const sfx = new SFX();
game.registry.set('sfx', sfx);

// Initialize SFX with Phaser's managed AudioContext so sounds stay
// unlocked across scene transitions (fixes missing SFX on levels 1-2)
game.events.once('ready', () => {
  const phaserCtx = game.sound && game.sound.context;
  sfx.init(phaserCtx);
});

// Mobile: wrap canvas in flex container, add SNES-style controller bar
if (isTouchDevice) {
  game.events.once('ready', () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'game-wrapper';
    canvas.parentNode.insertBefore(wrapper, canvas);
    wrapper.appendChild(canvas);

    const bar = document.createElement('div');
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

    game.registry.set('touchButtons', {
      left: document.getElementById('btn-left'),
      right: document.getElementById('btn-right'),
      jump: document.getElementById('btn-jump'),
      net: document.getElementById('btn-net'),
    });

    // Any controller button press emits 'controller-press' for menu navigation
    bar.addEventListener('touchstart', () => {
      game.events.emit('controller-press');
    });

    // Fix: refresh Phaser's scale manager after DOM manipulation
    // so pointer coordinates are correctly mapped on first load
    requestAnimationFrame(() => {
      game.scale.refresh();
    });
  });
}

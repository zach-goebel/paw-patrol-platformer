import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, GRAVITY } from './config/constants.js';
import GameState from './config/GameState.js';
import SFX from './utils/SFX.js';
import PreloadScene from './scenes/PreloadScene.js';
import MenuScene from './scenes/MenuScene.js';
import TutorialScene from './scenes/TutorialScene.js';
import GameScene from './scenes/GameScene.js';
import VictoryScene from './scenes/VictoryScene.js';
import UIScene from './scenes/UIScene.js';

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
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 3,
  },
  scene: [PreloadScene, MenuScene, TutorialScene, GameScene, VictoryScene, UIScene],
};

const game = new Phaser.Game(config);
game.registry.set('state', new GameState());

const sfx = new SFX();
sfx.init();
game.registry.set('sfx', sfx);

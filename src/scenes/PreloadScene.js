import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/constants.js';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    // Progress bar - pixel art bone that fills up
    const barX = GAME_WIDTH / 2 - 150;
    const barY = GAME_HEIGHT / 2 - 20;
    const barW = 300;
    const barH = 40;

    // Bone outline
    const outline = this.add.graphics();
    outline.lineStyle(4, 0xffffff);
    outline.strokeRoundedRect(barX, barY, barW, barH, 8);

    // Fill bar
    const fill = this.add.graphics();

    // Loading text (for parents)
    const loadText = this.add.text(GAME_WIDTH / 2, barY + barH + 30, 'Loading...', {
      fontSize: '16px',
      fill: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.load.on('progress', (value) => {
      fill.clear();
      fill.fillStyle(COLORS.TREAT_GOLD, 1);
      fill.fillRoundedRect(barX + 4, barY + 4, (barW - 8) * value, barH - 8, 6);
    });

    this.load.on('complete', () => {
      fill.destroy();
      outline.destroy();
      loadText.destroy();
    });

    // Track load errors
    this.loadErrors = [];
    this.load.on('loaderror', (fileObj) => {
      this.loadErrors.push(fileObj.key);
    });

    // Generate placeholder graphics as textures
    this.createPlaceholderTextures();
  }

  createPlaceholderTextures() {
    // Player (Chase) - blue rectangle with police hat shape
    const playerGfx = this.make.graphics({ add: false });
    playerGfx.fillStyle(COLORS.CHASE_BLUE);
    playerGfx.fillRect(4, 8, 24, 24);
    // Hat
    playerGfx.fillStyle(0x1a5276);
    playerGfx.fillRect(6, 2, 20, 8);
    playerGfx.fillStyle(COLORS.TREAT_GOLD);
    playerGfx.fillRect(12, 4, 8, 4);
    // Eyes
    playerGfx.fillStyle(0xffffff);
    playerGfx.fillRect(10, 14, 4, 4);
    playerGfx.fillRect(18, 14, 4, 4);
    playerGfx.fillStyle(0x000000);
    playerGfx.fillRect(12, 14, 2, 4);
    playerGfx.fillRect(20, 14, 2, 4);
    playerGfx.generateTexture('player', 32, 32);
    playerGfx.destroy();

    // Kitty enemy - purple rectangle with ears
    const kittyGfx = this.make.graphics({ add: false });
    kittyGfx.fillStyle(COLORS.KITTY_PURPLE);
    kittyGfx.fillRect(6, 10, 20, 20);
    // Ears
    kittyGfx.fillTriangle(6, 10, 6, 2, 14, 10);
    kittyGfx.fillTriangle(26, 10, 26, 2, 18, 10);
    // Eyes
    kittyGfx.fillStyle(0xf1c40f);
    kittyGfx.fillRect(10, 16, 4, 4);
    kittyGfx.fillRect(18, 16, 4, 4);
    kittyGfx.generateTexture('kitty', 32, 32);
    kittyGfx.destroy();

    // Treat collectible - golden bone shape
    const treatGfx = this.make.graphics({ add: false });
    treatGfx.fillStyle(COLORS.TREAT_GOLD);
    // Bone body
    treatGfx.fillRect(8, 12, 16, 8);
    // Bone ends
    treatGfx.fillCircle(8, 12, 4);
    treatGfx.fillCircle(8, 20, 4);
    treatGfx.fillCircle(24, 12, 4);
    treatGfx.fillCircle(24, 20, 4);
    treatGfx.generateTexture('treat', 32, 32);
    treatGfx.destroy();

    // Boss (Humdinger) - larger purple character with top hat
    const bossGfx = this.make.graphics({ add: false });
    bossGfx.fillStyle(COLORS.HUMDINGER_PURPLE);
    bossGfx.fillRect(8, 16, 48, 40);
    // Top hat
    bossGfx.fillStyle(0x1c1c1c);
    bossGfx.fillRect(16, 0, 32, 20);
    bossGfx.fillRect(12, 16, 40, 4);
    // Eyes
    bossGfx.fillStyle(0xffffff);
    bossGfx.fillRect(18, 24, 8, 6);
    bossGfx.fillRect(38, 24, 8, 6);
    bossGfx.fillStyle(0x000000);
    bossGfx.fillRect(22, 24, 4, 6);
    bossGfx.fillRect(42, 24, 4, 6);
    // Smirk
    bossGfx.lineStyle(2, 0x000000);
    bossGfx.lineBetween(24, 38, 40, 34);
    bossGfx.generateTexture('boss', 64, 64);
    bossGfx.destroy();

    // Skye - pink character with helmet
    const skyeGfx = this.make.graphics({ add: false });
    skyeGfx.fillStyle(0xff69b4);
    skyeGfx.fillRect(4, 8, 24, 24);
    // Helmet
    skyeGfx.fillStyle(0xff1493);
    skyeGfx.fillRect(6, 2, 20, 10);
    // Goggles
    skyeGfx.fillStyle(0x00bfff);
    skyeGfx.fillRect(8, 6, 6, 4);
    skyeGfx.fillRect(18, 6, 6, 4);
    // Eyes
    skyeGfx.fillStyle(0xffffff);
    skyeGfx.fillRect(10, 16, 4, 4);
    skyeGfx.fillRect(18, 16, 4, 4);
    skyeGfx.generateTexture('skye', 32, 32);
    skyeGfx.destroy();

    // Paw button for boss fight
    const pawGfx = this.make.graphics({ add: false });
    pawGfx.fillStyle(COLORS.PAW_RED);
    pawGfx.fillCircle(48, 48, 48);
    pawGfx.fillStyle(0xffffff);
    // Paw pad
    pawGfx.fillCircle(48, 52, 20);
    // Toes
    pawGfx.fillCircle(32, 32, 8);
    pawGfx.fillCircle(48, 26, 8);
    pawGfx.fillCircle(64, 32, 8);
    pawGfx.generateTexture('paw-button', 96, 96);
    pawGfx.destroy();

    // Play icon (triangle in circle)
    const playGfx = this.make.graphics({ add: false });
    playGfx.fillStyle(COLORS.BADGE_YELLOW);
    playGfx.fillCircle(64, 64, 64);
    playGfx.fillStyle(COLORS.PAW_RED);
    playGfx.fillTriangle(46, 32, 46, 96, 96, 64);
    playGfx.generateTexture('play-icon', 128, 128);
    playGfx.destroy();

    // Touch control buttons
    const arrowSize = 80;

    // Left arrow
    const leftGfx = this.make.graphics({ add: false });
    leftGfx.fillStyle(0x2ea3dc, 0.7);
    leftGfx.fillCircle(40, 40, 40);
    leftGfx.fillStyle(0xffffff);
    leftGfx.fillTriangle(50, 20, 50, 60, 20, 40);
    leftGfx.generateTexture('arrow-left', arrowSize, arrowSize);
    leftGfx.destroy();

    // Right arrow
    const rightGfx = this.make.graphics({ add: false });
    rightGfx.fillStyle(0x2ea3dc, 0.7);
    rightGfx.fillCircle(40, 40, 40);
    rightGfx.fillStyle(0xffffff);
    rightGfx.fillTriangle(30, 20, 30, 60, 60, 40);
    rightGfx.generateTexture('arrow-right', arrowSize, arrowSize);
    rightGfx.destroy();

    // Jump button
    const jumpGfx = this.make.graphics({ add: false });
    jumpGfx.fillStyle(COLORS.PAW_RED, 0.7);
    jumpGfx.fillCircle(40, 40, 40);
    jumpGfx.fillStyle(0xffffff);
    jumpGfx.fillTriangle(20, 52, 60, 52, 40, 22);
    jumpGfx.generateTexture('jump-button', arrowSize, arrowSize);
    jumpGfx.destroy();
  }

  create() {
    if (this.loadErrors.length > 0) {
      console.warn('Failed to load assets:', this.loadErrors);
    }
    this.scene.start('MenuScene');
  }
}

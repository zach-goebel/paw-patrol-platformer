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

    // Load external character sprites (64x64)
    this.load.image('player', 'assets/images/chase.png');
    this.load.image('kitty', 'assets/images/kitty.png');
    this.load.image('boss', 'assets/images/humdinger.png');
    this.load.image('skye', 'assets/images/skye.png');

    // Load music
    this.load.audio('theme', 'assets/audio/theme.mp3');

    // Load tiling backgrounds (800x480)
    this.load.image('bg-adventure-bay', 'assets/images/bg-adventure-bay.png');
    this.load.image('bg-foggy-bottom', 'assets/images/bg-foggy-bottom.png');
    this.load.image('bg-humdinger-lair', 'assets/images/bg-humdinger-lair.png');

    // Generate procedural textures for UI and treat (keeping the bone)
    this.createPlaceholderTextures();
  }

  createPlaceholderTextures() {
    // Treat collectible - golden bone shape (keeping procedural)
    const treatGfx = this.make.graphics({ add: false });
    treatGfx.fillStyle(COLORS.TREAT_GOLD);
    treatGfx.fillRect(8, 12, 16, 8);
    treatGfx.fillCircle(8, 12, 4);
    treatGfx.fillCircle(8, 20, 4);
    treatGfx.fillCircle(24, 12, 4);
    treatGfx.fillCircle(24, 20, 4);
    treatGfx.generateTexture('treat', 32, 32);
    treatGfx.destroy();

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

    // Heart icon for health HUD
    const heartGfx = this.make.graphics({ add: false });
    heartGfx.fillStyle(COLORS.PAW_RED);
    heartGfx.fillCircle(8, 6, 6);
    heartGfx.fillCircle(16, 6, 6);
    heartGfx.fillTriangle(2, 8, 22, 8, 12, 20);
    heartGfx.generateTexture('heart', 24, 22);
    heartGfx.destroy();

    // Empty heart icon
    const heartEmptyGfx = this.make.graphics({ add: false });
    heartEmptyGfx.lineStyle(2, 0x666666);
    heartEmptyGfx.strokeCircle(8, 6, 6);
    heartEmptyGfx.strokeCircle(16, 6, 6);
    heartEmptyGfx.strokeTriangle(2, 8, 22, 8, 12, 20);
    heartEmptyGfx.generateTexture('heart-empty', 24, 22);
    heartEmptyGfx.destroy();

    // Touch paw attack button (smaller version)
    const pawTouchGfx = this.make.graphics({ add: false });
    pawTouchGfx.fillStyle(COLORS.PAW_RED, 0.7);
    pawTouchGfx.fillCircle(40, 40, 40);
    pawTouchGfx.fillStyle(0xffffff);
    pawTouchGfx.fillCircle(40, 44, 16);
    pawTouchGfx.fillCircle(28, 28, 6);
    pawTouchGfx.fillCircle(40, 22, 6);
    pawTouchGfx.fillCircle(52, 28, 6);
    pawTouchGfx.generateTexture('paw-touch', arrowSize, arrowSize);
    pawTouchGfx.destroy();
  }

  create() {
    if (this.loadErrors.length > 0) {
      console.warn('Failed to load assets:', this.loadErrors);
    }
    this.scene.start('MenuScene');
  }
}

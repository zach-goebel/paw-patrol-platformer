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

    // Net projectile texture
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

    // Net button for boss fight prompt
    const netBtnGfx = this.make.graphics({ add: false });
    netBtnGfx.fillStyle(COLORS.CHASE_BLUE);
    netBtnGfx.fillCircle(48, 48, 48);
    netBtnGfx.fillStyle(0xffffff);
    netBtnGfx.fillRect(24, 30, 48, 36);
    netBtnGfx.lineStyle(2, 0xcccccc);
    for (let x = 24; x <= 72; x += 8) netBtnGfx.lineBetween(x, 30, x, 66);
    for (let y = 30; y <= 66; y += 8) netBtnGfx.lineBetween(24, y, 72, y);
    netBtnGfx.generateTexture('net-button', 96, 96);
    netBtnGfx.destroy();

    // Stage transition arrow (gold, pointing right)
    const arrowGfx = this.make.graphics({ add: false });
    arrowGfx.fillStyle(COLORS.TREAT_GOLD);
    arrowGfx.fillTriangle(24, 0, 48, 24, 24, 48);
    arrowGfx.fillRect(0, 12, 24, 24);
    arrowGfx.generateTexture('stage-arrow', 48, 48);
    arrowGfx.destroy();

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

    // Touch net attack button
    const netTouchGfx = this.make.graphics({ add: false });
    netTouchGfx.fillStyle(COLORS.CHASE_BLUE, 0.7);
    netTouchGfx.fillCircle(40, 40, 40);
    netTouchGfx.fillStyle(0xffffff);
    netTouchGfx.fillRect(20, 24, 40, 32);
    netTouchGfx.lineStyle(2, 0xcccccc);
    for (let x = 20; x <= 60; x += 8) netTouchGfx.lineBetween(x, 24, x, 56);
    for (let y = 24; y <= 56; y += 8) netTouchGfx.lineBetween(20, y, 60, y);
    netTouchGfx.generateTexture('net-touch', arrowSize, arrowSize);
    netTouchGfx.destroy();
  }

  create() {
    if (this.loadErrors.length > 0) {
      console.warn('Failed to load assets:', this.loadErrors);
    }
    this.scene.start('MenuScene');
  }
}

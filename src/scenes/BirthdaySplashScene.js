import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/constants.js';

export default class BirthdaySplashScene extends Phaser.Scene {
  constructor() {
    super('BirthdaySplashScene');
  }

  create() {
    this._transitioning = false;

    // Dark festive background
    this.cameras.main.setBackgroundColor(0x1a1a2e);
    this.cameras.main.fadeIn(400);

    // --- Pixel art balloons ---
    this.createBalloons();

    // --- "Happy Birthday" text ---
    const titleY = 100;
    const title = this.add.text(GAME_WIDTH / 2, titleY, 'HAPPY BIRTHDAY', {
      fontSize: '36px',
      fill: '#ffd700',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    const nameText = this.add.text(GAME_WIDTH / 2, titleY + 50, 'WAYLON!', {
      fontSize: '48px',
      fill: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#e31e24',
      strokeThickness: 8,
    }).setOrigin(0.5);

    // Gentle pulse on the name
    this.tweens.add({
      targets: nameText,
      scale: 1.08,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // --- Chase on left, Skye on right ---
    const characterY = GAME_HEIGHT / 2 + 30;
    const chase = this.add.image(140, characterY, 'player').setScale(1.8);
    const skye = this.add.image(GAME_WIDTH - 140, characterY, 'skye').setScale(1.8);

    // Bounce the characters
    this.tweens.add({
      targets: chase,
      y: characterY - 12,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: skye,
      y: characterY - 12,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 300,
    });

    // --- Arcade-style start button ---
    const btnY = GAME_HEIGHT - 100;

    // Button background (rounded rectangle)
    const btnBg = this.add.graphics();
    btnBg.fillStyle(COLORS.PAW_RED);
    btnBg.fillRoundedRect(GAME_WIDTH / 2 - 120, btnY - 28, 240, 56, 12);
    btnBg.lineStyle(3, 0xffffff);
    btnBg.strokeRoundedRect(GAME_WIDTH / 2 - 120, btnY - 28, 240, 56, 12);

    const btnText = this.add.text(GAME_WIDTH / 2, btnY, 'TAP TO PLAY', {
      fontSize: '24px',
      fill: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Glow pulse on button
    this.tweens.add({
      targets: [btnBg, btnText],
      alpha: 0.7,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // --- Input: any tap/click/key unlocks audio and transitions ---
    const hitArea = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setInteractive({ useHandCursor: true });

    hitArea.on('pointerdown', () => this.onTap());
    this.input.keyboard.on('keydown', () => this.onTap());

    // Mobile controller press
    this._controllerHandler = () => this.onTap();
    this.game.events.on('controller-press', this._controllerHandler);

    // --- Confetti particles for festive feel ---
    this.createConfetti();
  }

  onTap() {
    if (this._transitioning) return;
    this._transitioning = true;

    // === AUDIO UNLOCK (the primary purpose of this screen) ===

    // 1. Unlock AudioManager's pre-created HTML5 Audio pool
    const audioManager = this.registry.get('audioManager');
    if (audioManager) {
      audioManager.unlock();
      audioManager.resume();
    }

    // 2. Resume Web Audio context for SFX
    const sfx = this.registry.get('sfx');
    if (sfx) sfx.resume();

    // Clean up
    if (this._controllerHandler) {
      this.game.events.off('controller-press', this._controllerHandler);
      this._controllerHandler = null;
    }

    // Transition to menu
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MenuScene');
    });
  }

  createBalloons() {
    const balloonColors = [COLORS.PAW_RED, COLORS.CHASE_BLUE, COLORS.TREAT_GOLD, 0xff69b4, 0x2ecc71];
    const positions = [
      { x: 80, y: 60 },
      { x: 200, y: 40 },
      { x: 350, y: 55 },
      { x: 450, y: 35 },
      { x: 600, y: 50 },
      { x: 720, y: 45 },
    ];

    positions.forEach((pos, i) => {
      const color = balloonColors[i % balloonColors.length];
      const g = this.add.graphics();

      // Balloon body (oval)
      g.fillStyle(color);
      g.fillEllipse(pos.x, pos.y, 28, 34);

      // Highlight
      g.fillStyle(0xffffff, 0.3);
      g.fillEllipse(pos.x - 4, pos.y - 6, 8, 10);

      // Knot
      g.fillStyle(color);
      g.fillTriangle(pos.x - 3, pos.y + 16, pos.x + 3, pos.y + 16, pos.x, pos.y + 22);

      // String
      g.lineStyle(1, 0xcccccc);
      g.lineBetween(pos.x, pos.y + 22, pos.x + (i % 2 ? 5 : -5), pos.y + 60);

      // Float animation
      this.tweens.add({
        targets: g,
        y: -8,
        duration: 2000 + i * 300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
  }

  createConfetti() {
    const colors = [COLORS.PAW_RED, COLORS.TREAT_GOLD, COLORS.CHASE_BLUE, 0xff69b4, 0x2ecc71];

    this.time.addEvent({
      delay: 300,
      repeat: -1,
      callback: () => {
        const x = Phaser.Math.Between(20, GAME_WIDTH - 20);
        const color = Phaser.Utils.Array.GetRandom(colors);
        const size = Phaser.Math.Between(3, 6);
        const piece = this.add.rectangle(x, -10, size, size * 2, color);

        this.tweens.add({
          targets: piece,
          y: GAME_HEIGHT + 20,
          x: x + Phaser.Math.Between(-40, 40),
          angle: Phaser.Math.Between(180, 720),
          duration: Phaser.Math.Between(2000, 3500),
          ease: 'Sine.easeIn',
          onComplete: () => piece.destroy(),
        });
      },
    });
  }

  shutdown() {
    if (this._controllerHandler) {
      this.game.events.off('controller-press', this._controllerHandler);
      this._controllerHandler = null;
    }
  }
}

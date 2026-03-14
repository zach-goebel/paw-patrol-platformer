import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/constants.js';

export default class VictoryScene extends Phaser.Scene {
  constructor() {
    super('VictoryScene');
  }

  init(data) {
    this.playerTime = data.time || 0;
    this.playerTreats = data.treats || 0;
    this.playerKitties = data.kitties || 0;
  }

  create() {
    this.cameras.main.setBackgroundColor(0x1a1a2e);
    this.cameras.main.fadeIn(500);
    this._transitioning = false;

    // Victory fanfare was playing from GameScene.onReachSkye — kill it now.
    // Hard cut: immediately stop fanfare, start title theme with no overlap.
    const audioManager = this.registry.get('audioManager');
    if (audioManager) {
      audioManager.stopMusic(0);
      audioManager.playMusic('theme-title', { volume: 0.4, fadeIn: 0, fadeOut: 0 });
    }

    // Fireworks / confetti particles
    this.createFireworks();

    // Chase celebration
    const chase = this.add.image(GAME_WIDTH / 2 - 60, GAME_HEIGHT / 2 - 20, 'player').setScale(2);
    this.tweens.add({
      targets: chase,
      y: chase.y - 20,
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Skye celebration
    const skye = this.add.image(GAME_WIDTH / 2 + 60, GAME_HEIGHT / 2 - 20, 'skye').setScale(2);
    this.tweens.add({
      targets: skye,
      y: skye.y - 25,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 200,
    });

    // Victory text
    const victoryText = this.add.text(GAME_WIDTH / 2, 80, '⭐ RESCUED! ⭐', {
      fontSize: '40px',
      fill: '#ffd700',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: victoryText,
      scale: 1.1,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Auto-advance to name entry after 3 seconds
    this.time.delayedCall(3000, () => {
      this.goToNameEntry();
    });
  }

  goToNameEntry() {
    if (this._transitioning) return;
    this._transitioning = true;

    this.cameras.main.fadeOut(300);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('NameEntryScene', {
        time: this.playerTime,
        treats: this.playerTreats,
        kitties: this.playerKitties,
      });
    });
  }

  createFireworks() {
    const colors = [COLORS.PAW_RED, COLORS.BADGE_YELLOW, COLORS.CHASE_BLUE, 0xff69b4];

    this.time.addEvent({
      delay: 400,
      repeat: -1,
      callback: () => {
        const x = Phaser.Math.Between(50, GAME_WIDTH - 50);
        const y = Phaser.Math.Between(30, GAME_HEIGHT - 100);
        const color = Phaser.Utils.Array.GetRandom(colors);

        for (let i = 0; i < 8; i++) {
          const particle = this.add.circle(x, y, Phaser.Math.Between(3, 6), color);
          const angle = (i / 8) * Math.PI * 2;
          const speed = Phaser.Math.Between(60, 120);

          this.tweens.add({
            targets: particle,
            x: x + Math.cos(angle) * speed,
            y: y + Math.sin(angle) * speed,
            alpha: 0,
            scale: 0.2,
            duration: Phaser.Math.Between(500, 800),
            ease: 'Power2',
            onComplete: () => particle.destroy(),
          });
        }
      },
    });
  }
}

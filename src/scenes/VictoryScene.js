import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/constants.js';

export default class VictoryScene extends Phaser.Scene {
  constructor() {
    super('VictoryScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x1a1a2e);
    this.cameras.main.fadeIn(500);

    // Fireworks / confetti particles
    this.createFireworks();

    // Chase celebration
    const chase = this.add.image(GAME_WIDTH / 2 - 60, GAME_HEIGHT / 2 - 20, 'player').setScale(4);
    this.tweens.add({
      targets: chase,
      y: chase.y - 20,
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Skye celebration
    const skye = this.add.image(GAME_WIDTH / 2 + 60, GAME_HEIGHT / 2 - 20, 'skye').setScale(4);
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

    // Play again button after 3 seconds
    this.time.delayedCall(3000, () => {
      const playBtn = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT - 80, 'play-icon')
        .setScale(0.8)
        .setInteractive({ useHandCursor: true });

      this.tweens.add({
        targets: playBtn,
        scale: 0.9,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      playBtn.on('pointerdown', () => {
        this.cameras.main.fadeOut(300);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start('MenuScene');
        });
      });
    });

    // Auto-return to menu after 20 seconds
    this.time.delayedCall(20000, () => {
      this.cameras.main.fadeOut(500);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MenuScene');
      });
    });
  }

  createFireworks() {
    const colors = [COLORS.PAW_RED, COLORS.BADGE_YELLOW, COLORS.CHASE_BLUE, 0xff69b4];

    // Create bursts of colored circles at random positions
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

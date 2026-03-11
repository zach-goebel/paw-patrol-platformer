import Phaser from 'phaser';
import { GAME_WIDTH, MAX_HEALTH, COLORS } from '../config/constants.js';

export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  create() {
    // Semi-transparent HUD background strip
    this.add.rectangle(GAME_WIDTH / 2, 20, GAME_WIDTH, 40, COLORS.UI_DARK, 0.3);

    // Treat counter
    this.treatText = this.add.text(16, 8, '\u{1F9B4} 0', {
      fontSize: '24px',
      fill: '#ffd700',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });

    // Kitty capture counter
    this.kittyText = this.add.text(120, 8, '\u{1F431} 0', {
      fontSize: '24px',
      fill: '#c39bd3',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });

    // Health hearts (right side of HUD)
    this.hearts = [];
    for (let i = 0; i < MAX_HEALTH; i++) {
      const heart = this.add.image(GAME_WIDTH - 40 - i * 30, 20, 'heart').setScale(1.2);
      this.hearts.push(heart);
    }

    // Net button hint (small, bottom center)
    this.add.text(GAME_WIDTH / 2, 8, '[X] = Net', {
      fontSize: '12px',
      fill: '#aaaaaa',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0);

    // Listen for events
    this.game.events.on('score-changed', this.onScoreChanged, this);
    this.game.events.on('health-changed', this.onHealthChanged, this);
    this.game.events.on('kitty-captured', this.onKittyCaptured, this);

    this.events.on('shutdown', () => {
      this.game.events.off('score-changed', this.onScoreChanged, this);
      this.game.events.off('health-changed', this.onHealthChanged, this);
      this.game.events.off('kitty-captured', this.onKittyCaptured, this);
    });
  }

  onScoreChanged(treatsCollected) {
    this.treatText.setText(`\u{1F9B4} ${treatsCollected}`);

    this.tweens.add({
      targets: this.treatText,
      scale: 1.3,
      duration: 100,
      yoyo: true,
    });
  }

  onHealthChanged(health) {
    this.hearts.forEach((heart, i) => {
      if (i < health) {
        heart.setTexture('heart');
        heart.setAlpha(1);
      } else {
        heart.setTexture('heart-empty');
        heart.setAlpha(0.5);
      }
    });

    // Shake effect on damage
    if (health < MAX_HEALTH) {
      this.tweens.add({
        targets: this.hearts[health],
        scale: 1.5,
        duration: 100,
        yoyo: true,
      });
    }
  }

  onKittyCaptured(count) {
    this.kittyText.setText(`\u{1F431} ${count}`);

    this.tweens.add({
      targets: this.kittyText,
      scale: 1.3,
      duration: 100,
      yoyo: true,
    });
  }
}

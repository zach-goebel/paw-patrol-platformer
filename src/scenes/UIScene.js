import Phaser from 'phaser';
import { GAME_WIDTH, COLORS } from '../config/constants.js';

export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  create() {
    // Semi-transparent HUD background strip
    const bg = this.add.rectangle(GAME_WIDTH / 2, 20, GAME_WIDTH, 40, COLORS.UI_DARK, 0.3);

    // Treat counter - bone icons
    this.treatText = this.add.text(16, 8, '🦴 0', {
      fontSize: '24px',
      fill: '#ffd700',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });

    // Listen for score changes via global event bus
    this.game.events.on('score-changed', this.onScoreChanged, this);

    // Clean up on shutdown
    this.events.on('shutdown', () => {
      this.game.events.off('score-changed', this.onScoreChanged, this);
    });
  }

  onScoreChanged(treatsCollected) {
    this.treatText.setText(`🦴 ${treatsCollected}`);

    // Brief scale-up animation on collect
    this.tweens.add({
      targets: this.treatText,
      scale: 1.3,
      duration: 100,
      yoyo: true,
    });
  }
}

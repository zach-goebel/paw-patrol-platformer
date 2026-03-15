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

    // Timer display
    const state = this.registry.get('state');
    this.timerText = this.add.text(GAME_WIDTH / 2, 8, '0:00', {
      fontSize: '20px',
      fill: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0);

    this.timerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        const gameScene = this.scene.get('GameScene');
        const sceneElapsed = gameScene && gameScene._sceneElapsed ? gameScene._sceneElapsed : 0;
        const totalMs = state.totalTimeMs + sceneElapsed;
        const totalSec = Math.floor(totalMs / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        this.timerText.setText(`${min}:${String(sec).padStart(2, '0')}`);
      },
    });

    // Health hearts (right side of HUD)
    this.hearts = [];
    for (let i = 0; i < MAX_HEALTH; i++) {
      const heart = this.add.image(GAME_WIDTH - 40 - i * 30, 20, 'heart').setScale(1.2);
      this.hearts.push(heart);
    }

    // Mute button (next to timer)
    this.isMuted = false;
    this.muteBtn = this.add.text(GAME_WIDTH / 2 + 40, 8, '\u{1F50A}', {
      fontSize: '22px',
      stroke: '#000000',
      strokeThickness: 3,
    }).setInteractive({ useHandCursor: true }).setDepth(100);
    this.muteBtn.on('pointerdown', () => { this._toggleMute(); });

    // Listen for events
    this.game.events.on('score-changed', this.onScoreChanged, this);
    this.game.events.on('health-changed', this.onHealthChanged, this);
    this.game.events.on('kitty-captured', this.onKittyCaptured, this);

    this.events.on('shutdown', () => {
      this.game.events.off('score-changed', this.onScoreChanged, this);
      this.game.events.off('health-changed', this.onHealthChanged, this);
      this.game.events.off('kitty-captured', this.onKittyCaptured, this);
      if (this.timerEvent) this.timerEvent.destroy();
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

  _toggleMute() {
    this.isMuted = !this.isMuted;
    this.muteBtn.setText(this.isMuted ? '\u{1F507}' : '\u{1F50A}');

    const audioManager = this.registry.get('audioManager');
    if (audioManager) audioManager.toggleMute();

    const sfx = this.registry.get('sfx');
    if (sfx) sfx.muted = this.isMuted;
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

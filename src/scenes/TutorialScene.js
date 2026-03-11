import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/constants.js';

export default class TutorialScene extends Phaser.Scene {
  constructor() {
    super('TutorialScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x1a3a5c);
    this.cameras.main.fadeIn(300);

    // Title
    this.add.text(GAME_WIDTH / 2, 40, 'HOW TO PLAY', {
      fontSize: '32px',
      fill: '#ffd700',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Chase sprite
    this.add.image(GAME_WIDTH / 2, 100, 'player').setScale(1.5);

    const controls = [
      { icon: '← →', label: 'Arrow Keys = Move' },
      { icon: '↑ / Space', label: 'Jump (press twice to double jump!)' },
      { icon: 'X', label: 'Paw Attack (defeat kitties & bosses!)' },
    ];

    const startY = 160;
    const spacing = 60;

    controls.forEach((ctrl, i) => {
      const y = startY + i * spacing;

      // Key box
      this.add.rectangle(GAME_WIDTH / 2 - 140, y, 100, 40, 0x2e86c1)
        .setStrokeStyle(2, 0xffffff);

      this.add.text(GAME_WIDTH / 2 - 140, y, ctrl.icon, {
        fontSize: '18px',
        fill: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      // Label
      this.add.text(GAME_WIDTH / 2 - 70, y, ctrl.label, {
        fontSize: '16px',
        fill: '#ffffff',
        fontFamily: 'monospace',
      }).setOrigin(0, 0.5);
    });

    // Touch controls note
    if (this.sys.game.device.input.touch) {
      this.add.text(GAME_WIDTH / 2, startY + 3 * spacing + 10, 'Touch: Use on-screen buttons!', {
        fontSize: '14px',
        fill: '#87ceeb',
        fontFamily: 'monospace',
      }).setOrigin(0.5);

      // Show paw button
      this.add.image(GAME_WIDTH / 2 + 120, startY + 2 * spacing - 40, 'paw-button').setScale(0.4);
    }

    // Dismiss prompt
    const prompt = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 50, 'Press any key or tap to start!', {
      fontSize: '20px',
      fill: '#ffd700',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.4,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    // Dismiss on any input
    this.input.keyboard.on('keydown', () => this.startGame());
    this.input.on('pointerdown', () => this.startGame());
    this.dismissed = false;
  }

  startGame() {
    if (this.dismissed) return;
    this.dismissed = true;

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene', { level: 0 });
    });
  }
}

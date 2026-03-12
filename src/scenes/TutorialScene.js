import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/constants.js';

export default class TutorialScene extends Phaser.Scene {
  constructor() {
    super('TutorialScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x1a3a5c);
    this.cameras.main.fadeIn(300);

    const isTouchDevice = this.registry.get('isTouchDevice');

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

    if (isTouchDevice) {
      this.createTouchInstructions();
    } else {
      this.createKeyboardInstructions();
    }

    // Gameplay tips
    const tipY = 350;
    this.add.text(GAME_WIDTH / 2, tipY, 'Jump on a kitty or shoot a net to capture it!', {
      fontSize: '14px',
      fill: '#87ceeb',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, tipY + 22, 'Hit Humdinger with a net while he\'s flashing!', {
      fontSize: '14px',
      fill: '#87ceeb',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Dismiss prompt
    const promptText = isTouchDevice
      ? 'Press any button to start!'
      : 'Press any key or tap to start!';
    const prompt = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 50, promptText, {
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

    // Controller buttons also advance (mobile)
    this._controllerHandler = () => { this.startGame(); };
    this.game.events.on('controller-press', this._controllerHandler);
  }

  createKeyboardInstructions() {
    const controls = [
      { icon: '← →', label: 'Arrow Keys = Move' },
      { icon: '↑ / Space', label: 'Jump (press twice to double jump!)' },
      { icon: 'X', label: 'Shoot Net (capture kitties!)' },
    ];

    const startY = 160;
    const spacing = 60;

    controls.forEach((ctrl, i) => {
      const y = startY + i * spacing;

      this.add.rectangle(GAME_WIDTH / 2 - 140, y, 100, 40, 0x2e86c1)
        .setStrokeStyle(2, 0xffffff);

      this.add.text(GAME_WIDTH / 2 - 140, y, ctrl.icon, {
        fontSize: '18px',
        fill: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      this.add.text(GAME_WIDTH / 2 - 70, y, ctrl.label, {
        fontSize: '16px',
        fill: '#ffffff',
        fontFamily: 'monospace',
      }).setOrigin(0, 0.5);
    });
  }

  createTouchInstructions() {
    const controls = [
      { icon: '◀ ▶', color: 0x333355, label: 'D-Pad = Move left & right' },
      { icon: '▲', color: 0xc0392b, label: 'Red button = Jump (tap twice\nfor double jump!)' },
      { icon: '🕸', color: 0x2e86c1, label: 'Blue button = Shoot Net\n(capture kitties!)' },
    ];

    const startY = 160;
    const spacing = 60;

    controls.forEach((ctrl, i) => {
      const y = startY + i * spacing;

      // Colored circle/box to represent the button
      this.add.circle(GAME_WIDTH / 2 - 140, y, 22, ctrl.color)
        .setStrokeStyle(2, 0xffffff);

      this.add.text(GAME_WIDTH / 2 - 140, y, ctrl.icon, {
        fontSize: '16px',
        fill: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      this.add.text(GAME_WIDTH / 2 - 70, y, ctrl.label, {
        fontSize: '14px',
        fill: '#ffffff',
        fontFamily: 'monospace',
        lineSpacing: 4,
      }).setOrigin(0, 0.5);
    });
  }

  startGame() {
    if (this.dismissed) return;
    this.dismissed = true;

    if (this._controllerHandler) {
      this.game.events.off('controller-press', this._controllerHandler);
      this._controllerHandler = null;
    }

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene', { level: 0 });
    });
  }

  shutdown() {
    if (this._controllerHandler) {
      this.game.events.off('controller-press', this._controllerHandler);
      this._controllerHandler = null;
    }
  }
}

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/constants.js';

export default class StoryScene extends Phaser.Scene {
  constructor() {
    super('StoryScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.LAIR_DARK);
    this.cameras.main.fadeIn(300);

    // Chase on the left
    this.add.image(120, GAME_HEIGHT / 2 - 20, 'player').setScale(1.5);

    // Humdinger center-right
    this.add.image(GAME_WIDTH / 2 + 80, GAME_HEIGHT / 2 - 30, 'boss').setScale(1.5);

    // Skye in cage
    this.add.image(GAME_WIDTH / 2 + 200, GAME_HEIGHT / 2 - 30, 'skye').setScale(1.2);

    // Cage bars around Skye
    const cageGfx = this.add.graphics();
    cageGfx.lineStyle(3, 0x888888);
    const cageX = GAME_WIDTH / 2 + 175;
    const cageY = GAME_HEIGHT / 2 - 60;
    for (let i = 0; i < 5; i++) {
      cageGfx.lineBetween(cageX + i * 12, cageY, cageX + i * 12, cageY + 60);
    }
    cageGfx.lineBetween(cageX, cageY, cageX + 48, cageY);
    cageGfx.lineBetween(cageX, cageY + 60, cageX + 48, cageY + 60);

    // Kitties flanking Humdinger
    this.add.image(GAME_WIDTH / 2 - 20, GAME_HEIGHT / 2 + 10, 'kitty').setScale(1);
    this.add.image(GAME_WIDTH / 2 + 280, GAME_HEIGHT / 2 + 10, 'kitty').setScale(1).setFlipX(true);

    // Story text
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 100,
      'Mayor Humdinger has captured Skye!\nChase must get past the kitties\nto rescue her!', {
      fontSize: '18px',
      fill: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5);

    // Tap to continue prompt
    const prompt = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 30, 'Tap or press any key!', {
      fontSize: '16px',
      fill: '#ffd700',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.4,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    this._transitioning = false;
    this.input.keyboard.on('keydown', () => this.proceed());
    this.input.on('pointerdown', () => this.proceed());
  }

  proceed() {
    if (this._transitioning) return;
    this._transitioning = true;
    this.input.enabled = false;

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene', { level: 0 });
    });
  }
}

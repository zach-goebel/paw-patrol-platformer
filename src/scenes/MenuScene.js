import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/constants.js';
import { getScores } from '../utils/LeaderboardAPI.js';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    this._transitioning = false;
    this._musicStarted = false;

    // Sky background
    this.cameras.main.setBackgroundColor(COLORS.SKY_BLUE);

    // Ground
    const ground = this.add.graphics();
    ground.fillStyle(COLORS.GRASS_GREEN);
    ground.fillRect(0, GAME_HEIGHT - 80, GAME_WIDTH, 80);

    // Title text (for parents - toddler sees the icons)
    this.add.text(GAME_WIDTH / 2, 80, 'PAW PATROL', {
      fontSize: '48px',
      fill: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#1b3a5c',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 130, 'RESCUE RUN', {
      fontSize: '32px',
      fill: '#ffd700',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#1b3a5c',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Chase character on the left (64x64 sprite, scale 1.5 for menu)
    this.add.image(160, GAME_HEIGHT - 112, 'player').setScale(1.5);

    // Play button - giant pulsing icon
    const playBtn = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10, 'play-icon')
      .setScale(1.2)
      .setInteractive({ useHandCursor: true });

    // Pulsing animation
    this.tweens.add({
      targets: playBtn,
      scale: 1.35,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Leaderboard button
    const lbBtn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 130, 'LEADERBOARD', {
      fontSize: '18px',
      fill: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#1b3a5c',
      strokeThickness: 3,
      backgroundColor: '#2e86c1',
      padding: { x: 14, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    lbBtn.on('pointerdown', () => { this.onLeaderboardTap(); });

    // Play button handler — click or any key
    playBtn.on('pointerdown', () => {
      this.onPlayTap(playBtn);
    });
    this.input.keyboard.on('keydown', () => {
      this.onPlayTap(playBtn);
    });

    // Controller buttons also start the game (mobile)
    this._controllerHandler = () => { this.onPlayTap(playBtn); };
    this.game.events.on('controller-press', this._controllerHandler);

    // Fullscreen button — desktop only (iOS Safari doesn't support Fullscreen API)
    const isTouchDevice = this.registry.get('isTouchDevice');
    if (!isTouchDevice) {
      const fsBtn = this.add.graphics();
      fsBtn.fillStyle(0x000000, 0.3);
      fsBtn.fillRoundedRect(0, 0, 48, 48, 8);
      fsBtn.lineStyle(2, 0xffffff);
      fsBtn.lineBetween(10, 10, 18, 10);
      fsBtn.lineBetween(10, 10, 10, 18);
      fsBtn.lineBetween(38, 10, 30, 10);
      fsBtn.lineBetween(38, 10, 38, 18);
      fsBtn.lineBetween(10, 38, 18, 38);
      fsBtn.lineBetween(10, 38, 10, 30);
      fsBtn.lineBetween(38, 38, 30, 38);
      fsBtn.lineBetween(38, 38, 38, 30);
      fsBtn.setPosition(GAME_WIDTH - 60, 10);
      fsBtn.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, 48, 48),
        Phaser.Geom.Rectangle.Contains
      );
      fsBtn.on('pointerdown', () => {
        if (this.scale.isFullscreen) {
          this.scale.stopFullscreen();
        } else {
          this.scale.startFullscreen();
        }
      });
    }

    // Try to start title music immediately — will succeed if user has
    // already interacted with the page (e.g. returning from leaderboard).
    this._startTitleMusic();

    // Autoplay fallback: use document-level listeners (not Phaser input)
    // because Phaser input events don't fire until the canvas has focus,
    // which may never happen if the user clicks outside the canvas first.
    this._unlockMusic = () => { this._startTitleMusic(); };
    document.addEventListener('pointerdown', this._unlockMusic, { once: false, capture: true });
    document.addEventListener('keydown', this._unlockMusic, { once: false, capture: true });
  }

  _startTitleMusic() {
    if (this._musicStarted) return;
    const audioManager = this.registry.get('audioManager');
    if (!audioManager) return;
    audioManager.resume();
    audioManager.playMusic('theme-title', { volume: 0.4, fadeIn: 800 });
    this._musicStarted = true;

    // Clean up the document-level unlock listeners
    if (this._unlockMusic) {
      document.removeEventListener('pointerdown', this._unlockMusic, true);
      document.removeEventListener('keydown', this._unlockMusic, true);
      this._unlockMusic = null;
    }
  }

  onPlayTap(playBtn) {
    if (this._transitioning) return;
    this._transitioning = true;

    // Clean up controller listener
    if (this._controllerHandler) {
      this.game.events.off('controller-press', this._controllerHandler);
      this._controllerHandler = null;
    }

    // Disable the button visually
    playBtn.setAlpha(0.5);
    playBtn.disableInteractive();

    // Reset game state
    this.registry.get('state').reset();

    // Audio unlock happens on user gesture (this tap)
    const sfx = this.registry.get('sfx');
    if (sfx) sfx.resume();

    // Ensure title music is playing (in case autoplay was blocked)
    this._startTitleMusic();

    // Brief flash transition
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('StoryScene');
    });
  }

  onLeaderboardTap() {
    if (this._transitioning) return;
    this._transitioning = true;

    // Clean up controller listener
    if (this._controllerHandler) {
      this.game.events.off('controller-press', this._controllerHandler);
      this._controllerHandler = null;
    }

    // Unlock audio on this gesture too
    const sfx = this.registry.get('sfx');
    if (sfx) sfx.resume();
    const audioManager = this.registry.get('audioManager');
    if (audioManager) audioManager.resume();

    this.cameras.main.fadeOut(300);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('LeaderboardScene', { fromMenu: true });
    });
  }

  shutdown() {
    if (this._controllerHandler) {
      this.game.events.off('controller-press', this._controllerHandler);
      this._controllerHandler = null;
    }
    if (this._unlockMusic) {
      document.removeEventListener('pointerdown', this._unlockMusic, true);
      document.removeEventListener('keydown', this._unlockMusic, true);
      this._unlockMusic = null;
    }
  }
}

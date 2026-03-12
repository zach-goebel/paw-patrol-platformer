import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants.js';
import { getScores } from '../utils/LeaderboardAPI.js';

const BG_COLOR = 0x1a0e2e;
const BOARD_CONFIGS = [
  { key: 'time', title: 'TOP TIMES', header: 'TIME', accent: '#00ffff', accentHex: 0x00ffff, formatValue: (e) => {
    const m = Math.floor(e.time / 60);
    const s = e.time % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }},
  { key: 'treats', title: 'TOP TREATS', header: 'TREATS', accent: '#ffd700', accentHex: 0xffd700, formatValue: (e) => String(e.treats) },
  { key: 'kitties', title: 'TOP KITTIES', header: 'KITTIES', accent: '#ff69b4', accentHex: 0xff69b4, formatValue: (e) => String(e.kitties) },
];
const RANK_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32'];
const AUTO_ROTATE_MS = 5000;

export default class LeaderboardScene extends Phaser.Scene {
  constructor() {
    super('LeaderboardScene');
  }

  init(data) {
    this.boards = data.boards || null;
    this.playerName = data.playerName || null;
    this.fromMenu = data.fromMenu || false;
  }

  create() {
    this._alive = true;
    this._transitioning = false;
    this.currentBoardIndex = 0;
    this.events.once('shutdown', () => { this._alive = false; });

    this.cameras.main.setBackgroundColor(BG_COLOR);
    this.cameras.main.fadeIn(400);

    // Scanline overlay
    this.createScanlines();

    if (this.boards) {
      this.onDataReady();
    } else {
      // Fetch from API
      this.loadingText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'LOADING...', {
        fontSize: '28px', fill: '#ffd700', fontFamily: 'monospace', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5);

      this.tweens.add({
        targets: this.loadingText, alpha: { from: 0.4, to: 1 },
        duration: 500, yoyo: true, repeat: -1,
      });

      getScores().then(boards => {
        if (!this._alive) return;
        this.boards = boards;
        if (this.loadingText) this.loadingText.destroy();
        this.onDataReady();
      });
    }

    // Input setup
    this.input.keyboard.on('keydown-LEFT', () => this.showBoard(this.currentBoardIndex - 1));
    this.input.keyboard.on('keydown-RIGHT', () => this.showBoard(this.currentBoardIndex + 1));
    this.input.keyboard.on('keydown-ENTER', () => this.exitScene());
    this.input.keyboard.on('keydown-SPACE', () => this.exitScene());

    // Swipe detection
    this.input.on('pointerdown', (pointer) => {
      this._swipeStart = { x: pointer.x, time: pointer.downTime };
    });
    this.input.on('pointerup', (pointer) => {
      if (!this._swipeStart) return;
      const dx = pointer.x - this._swipeStart.x;
      const dt = pointer.upTime - this._swipeStart.time;
      if (dt < 300 && Math.abs(dx) > 50) {
        this.showBoard(this.currentBoardIndex + (dx > 0 ? -1 : 1));
      }
      this._swipeStart = null;
    });

    // Controller support
    this._controllerHandler = () => { this.exitScene(); };
    this.game.events.on('controller-press', this._controllerHandler);

    // Touch left/right for board switching
    const buttons = this.registry.get('touchButtons');
    if (buttons) {
      this._touchLeft = () => this.showBoard(this.currentBoardIndex - 1);
      this._touchRight = () => this.showBoard(this.currentBoardIndex + 1);
      buttons.left.addEventListener('touchstart', this._touchLeft);
      buttons.right.addEventListener('touchstart', this._touchRight);
    }
  }

  onDataReady() {
    // If no data or error, show empty state
    if (!this.boards) {
      this.boards = { time: [], treats: [], kitties: [] };
    }

    this.boardContainer = null;
    this.renderBoard(0);
    this.scheduleAutoRotate();

    // Exit button (appears after 1.5s)
    this.time.delayedCall(1500, () => {
      if (!this._alive) return;
      const label = this.fromMenu ? 'BACK' : 'PLAY AGAIN';
      const exitBtn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 35, label, {
        fontSize: '20px', fill: '#ffd700', fontFamily: 'monospace', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
        backgroundColor: '#333355', padding: { x: 16, y: 6 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(500);

      exitBtn.on('pointerdown', () => this.exitScene());

      this.tweens.add({
        targets: exitBtn, alpha: { from: 0.6, to: 1 },
        duration: 600, yoyo: true, repeat: -1,
      });
    });
  }

  renderBoard(index) {
    const config = BOARD_CONFIGS[index];
    const entries = this.boards[config.key] || [];

    // Destroy old container
    if (this.boardContainer) {
      this.boardContainer.destroy();
    }

    const container = this.add.container(0, 0);
    this.boardContainer = container;

    // Navigation arrows
    const leftArrow = this.add.text(50, 28, '◀', {
      fontSize: '24px', fill: '#2e86c1', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    leftArrow.on('pointerdown', () => this.showBoard(index - 1));
    container.add(leftArrow);

    const rightArrow = this.add.text(GAME_WIDTH - 50, 28, '▶', {
      fontSize: '24px', fill: '#2e86c1', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    rightArrow.on('pointerdown', () => this.showBoard(index + 1));
    container.add(rightArrow);

    // Title
    const titleGlow = this.add.text(GAME_WIDTH / 2, 28, config.title, {
      fontSize: '30px', fill: config.accent, fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
      shadow: { offsetX: 0, offsetY: 0, color: config.accent, blur: 12, fill: true, stroke: true },
      padding: { x: 15, y: 8 },
    }).setOrigin(0.5).setAlpha(0.3);
    container.add(titleGlow);

    const title = this.add.text(GAME_WIDTH / 2, 28, config.title, {
      fontSize: '30px', fill: config.accent, fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    container.add(title);

    // Page indicator
    const pageText = this.add.text(GAME_WIDTH - 100, 28, `${index + 1}/3`, {
      fontSize: '16px', fill: '#8888aa', fontFamily: 'monospace',
    }).setOrigin(0.5);
    container.add(pageText);

    // Separator
    const sep = this.add.graphics();
    sep.lineStyle(2, config.accentHex, 0.5);
    sep.lineBetween(60, 52, GAME_WIDTH - 60, 52);
    sep.lineBetween(60, 55, GAME_WIDTH - 60, 55);
    container.add(sep);

    // Column headers
    const headerStyle = { fontSize: '14px', fill: '#aaaacc', fontFamily: 'monospace', fontStyle: 'bold' };
    container.add(this.add.text(75, 65, 'RNK', headerStyle));
    container.add(this.add.text(150, 65, 'NAME', headerStyle));
    container.add(this.add.text(GAME_WIDTH - 130, 65, config.header, headerStyle).setOrigin(1, 0));

    // Header underline
    const hline = this.add.graphics();
    hline.lineStyle(1, 0x555577);
    hline.lineBetween(60, 82, GAME_WIDTH - 60, 82);
    container.add(hline);

    if (entries.length === 0) {
      // Empty state
      const emptyText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'NO SCORES YET!', {
        fontSize: '24px', fill: '#ffd700', fontFamily: 'monospace', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5);
      container.add(emptyText);

      const subText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 15, 'Be the first to play!', {
        fontSize: '16px', fill: '#8888aa', fontFamily: 'monospace',
      }).setOrigin(0.5);
      container.add(subText);
      return;
    }

    // Render rows
    const rowStartY = 88;
    const rowHeight = 19;

    entries.forEach((entry, i) => {
      const y = rowStartY + i * rowHeight;
      const rank = i + 1;

      // Player highlight
      if (this.playerName && entry.name === this.playerName) {
        const highlight = this.add.rectangle(GAME_WIDTH / 2, y + 4, GAME_WIDTH - 120, rowHeight, config.accentHex, 0.12);
        container.add(highlight);
        this.tweens.add({
          targets: highlight, alpha: { from: 0.08, to: 0.2 },
          duration: 600, yoyo: true, repeat: -1,
        });
      }

      // Rank color
      let rankColor = '#ffffff';
      if (rank <= 3) rankColor = RANK_COLORS[rank - 1];
      else if (rank > 10) rankColor = '#8888aa';

      const nameColor = rankColor;
      const valueColor = rank <= 3 ? rankColor : '#cccccc';

      // Rank
      container.add(this.add.text(85, y, `${rank}.`, {
        fontSize: '14px', fill: rankColor, fontFamily: 'monospace', fontStyle: rank <= 3 ? 'bold' : '',
      }).setOrigin(0.5, 0));

      // Name
      const nameText = this.add.text(150, y, entry.name || '???', {
        fontSize: '14px', fill: nameColor, fontFamily: 'monospace', fontStyle: rank <= 3 ? 'bold' : '',
      });
      container.add(nameText);

      // Value
      container.add(this.add.text(GAME_WIDTH - 130, y, config.formatValue(entry), {
        fontSize: '14px', fill: valueColor, fontFamily: 'monospace',
      }).setOrigin(1, 0));

      // YOU marker
      if (this.playerName && entry.name === this.playerName) {
        container.add(this.add.text(GAME_WIDTH - 70, y, '←YOU', {
          fontSize: '12px', fill: config.accent, fontFamily: 'monospace', fontStyle: 'bold',
        }));
      }

      // Staggered entrance
      const rowObjects = container.list.slice(-4);
      rowObjects.forEach(obj => {
        obj.setAlpha(0);
        obj.x -= 20;
        this.tweens.add({
          targets: obj, alpha: 1, x: obj.x + 20,
          duration: 60, delay: i * 30, ease: 'Power1',
        });
      });
    });

    // Page dots
    for (let i = 0; i < 3; i++) {
      const dot = this.add.circle(GAME_WIDTH / 2 - 20 + i * 20, GAME_HEIGHT - 60, 4,
        i === index ? 0xffffff : 0x444466);
      container.add(dot);
    }
  }

  showBoard(index) {
    // Wrap around
    index = ((index % 3) + 3) % 3;
    if (index === this.currentBoardIndex) return;

    this.currentBoardIndex = index;
    this.renderBoard(index);
    this.scheduleAutoRotate();
  }

  scheduleAutoRotate() {
    if (this._autoTimer) this._autoTimer.remove(false);
    this._autoTimer = this.time.delayedCall(AUTO_ROTATE_MS, () => {
      if (!this._alive) return;
      this.showBoard(this.currentBoardIndex + 1);
      this.scheduleAutoRotate();
    });
  }

  exitScene() {
    if (this._transitioning) return;
    this._transitioning = true;

    this.cleanupInput();

    this.cameras.main.fadeOut(300);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MenuScene');
    });
  }

  cleanupInput() {
    if (this._controllerHandler) {
      this.game.events.off('controller-press', this._controllerHandler);
      this._controllerHandler = null;
    }
    if (this._autoTimer) {
      this._autoTimer.remove(false);
      this._autoTimer = null;
    }

    const buttons = this.registry.get('touchButtons');
    if (buttons) {
      if (this._touchLeft) {
        buttons.left.removeEventListener('touchstart', this._touchLeft);
        this._touchLeft = null;
      }
      if (this._touchRight) {
        buttons.right.removeEventListener('touchstart', this._touchRight);
        this._touchRight = null;
      }
    }
  }

  createScanlines() {
    const scanlines = this.add.graphics();
    scanlines.setDepth(1000);
    scanlines.fillStyle(0x000000, 0.08);
    for (let y = 0; y < GAME_HEIGHT; y += 4) {
      scanlines.fillRect(0, y, GAME_WIDTH, 2);
    }
  }

  shutdown() {
    this.cleanupInput();
  }
}

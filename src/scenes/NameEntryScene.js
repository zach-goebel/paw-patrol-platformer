import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants.js';
import { submitScore } from '../utils/LeaderboardAPI.js';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ';
const MAX_NAME_LEN = 6;
const INPUT_COOLDOWN = 200;
const AUTO_SUBMIT_MS = 60000;
const BG_COLOR = 0x1a0e2e;

export default class NameEntryScene extends Phaser.Scene {
  constructor() {
    super('NameEntryScene');
  }

  init(data) {
    this.playerTime = data.time || 0;
    this.playerTreats = data.treats || 0;
    this.playerKitties = data.kitties || 0;
  }

  create() {
    this._alive = true;
    this._hasSubmitted = false;
    this._lastInputTime = 0;
    this._okFocused = false;
    this.events.once('shutdown', () => { this._alive = false; });

    this.cameras.main.setBackgroundColor(BG_COLOR);
    this.cameras.main.fadeIn(400);

    // Scanline overlay
    this.createScanlines();

    // Title
    const titleGlow = this.add.text(GAME_WIDTH / 2, 50, 'ENTER YOUR NAME', {
      fontSize: '36px', fill: '#ffd700', fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
      shadow: { offsetX: 0, offsetY: 0, color: '#ffd700', blur: 15, fill: true, stroke: true },
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setAlpha(0.3);

    this.add.text(GAME_WIDTH / 2, 50, 'ENTER YOUR NAME', {
      fontSize: '36px', fill: '#ffd700', fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: titleGlow, alpha: { from: 0.2, to: 0.4 },
      duration: 1200, yoyo: true, repeat: -1,
    });

    // Name slots
    this.nameChars = [];
    this.charIndices = [];
    this.cursorPos = 0;
    this.slotTexts = [];

    const slotStartX = GAME_WIDTH / 2 - ((MAX_NAME_LEN - 1) * 55) / 2;
    for (let i = 0; i < MAX_NAME_LEN; i++) {
      this.nameChars.push('');
      this.charIndices.push(0);
      const x = slotStartX + i * 55;

      // Slot background
      this.add.rectangle(x, 180, 44, 54, 0x2a1a4e).setStrokeStyle(2, 0x444466);

      const txt = this.add.text(x, 180, '_', {
        fontSize: '40px', fill: '#8b7daa', fontFamily: 'monospace', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5);
      this.slotTexts.push(txt);
    }

    this.updateSlotVisuals();

    // Stats display
    const min = Math.floor(this.playerTime / 60);
    const sec = this.playerTime % 60;
    this.add.text(GAME_WIDTH / 2, 240, `Time: ${min}:${String(sec).padStart(2, '0')}   Treats: ${this.playerTreats}   Kitties: ${this.playerKitties}`, {
      fontSize: '14px', fill: '#8888aa', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);

    // OK button
    this.okBg = this.add.rectangle(310, 320, 120, 50, 0x333355).setStrokeStyle(2, 0x555577);
    this.okText = this.add.text(310, 320, 'OK', {
      fontSize: '28px', fill: '#888888', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    // DEL button
    this.delBg = this.add.rectangle(490, 320, 120, 50, 0xe74c3c).setStrokeStyle(2, 0xf1948a);
    this.add.text(490, 320, 'DEL', {
      fontSize: '28px', fill: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Hint text
    const isTouchDevice = this.registry.get('isTouchDevice');
    const hint = isTouchDevice
      ? '◀▶ = change letter   JUMP = confirm   NET = delete'
      : '← → = change letter   ENTER = confirm   BACKSPACE = delete';
    this.add.text(GAME_WIDTH / 2, 400, hint, {
      fontSize: '12px', fill: '#666688', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);

    // Auto-submit countdown text
    this.autoSubmitText = this.add.text(GAME_WIDTH / 2, 440, '', {
      fontSize: '11px', fill: '#444466', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Input setup
    this.setupKeyboardInput();
    if (isTouchDevice) {
      this.setupTouchInput();
    }

    // Auto-submit timer
    this._autoSubmitTimer = this.time.delayedCall(AUTO_SUBMIT_MS, () => {
      this.submitName();
    });

    // Update auto-submit countdown
    this._countdownEvent = this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        if (!this._autoSubmitTimer) return;
        const remaining = Math.ceil((AUTO_SUBMIT_MS - this._autoSubmitTimer.elapsed) / 1000);
        if (remaining <= 15) {
          this.autoSubmitText.setText(`Auto-submit in ${remaining}s`);
        }
      },
    });
  }

  setupKeyboardInput() {
    this.input.keyboard.on('keydown-LEFT', () => this.onCycleLetter(-1));
    this.input.keyboard.on('keydown-RIGHT', () => this.onCycleLetter(1));
    this.input.keyboard.on('keydown-UP', () => this.onCycleLetter(-1));
    this.input.keyboard.on('keydown-DOWN', () => this.onCycleLetter(1));
    this.input.keyboard.on('keydown-ENTER', () => this.onConfirm());
    this.input.keyboard.on('keydown-SPACE', () => this.onConfirm());
    this.input.keyboard.on('keydown-BACKSPACE', (e) => {
      e.preventDefault();
      this.onDelete();
    });

    // Direct letter typing
    this.input.keyboard.on('keydown', (event) => {
      if (event.keyCode >= 65 && event.keyCode <= 90 && !this._okFocused) {
        const letter = String.fromCharCode(event.keyCode);
        const idx = CHARS.indexOf(letter);
        if (idx !== -1 && this.cursorPos < MAX_NAME_LEN) {
          this.charIndices[this.cursorPos] = idx;
          this.nameChars[this.cursorPos] = letter;
          this.updateSlotVisuals();
          this.cursorPos = Math.min(this.cursorPos + 1, MAX_NAME_LEN - 1);
          this.updateSlotVisuals();
          this.playTick();
          this.resetAutoSubmit();
        }
      }
    });
  }

  setupTouchInput() {
    const buttons = this.registry.get('touchButtons');
    if (!buttons) return;

    this._touchHandlers = {
      left: () => this.onCycleLetter(-1),
      right: () => this.onCycleLetter(1),
      jump: () => this.onConfirm(),
      net: () => this.onDelete(),
    };

    buttons.left.addEventListener('touchstart', this._touchHandlers.left);
    buttons.right.addEventListener('touchstart', this._touchHandlers.right);
    buttons.jump.addEventListener('touchstart', this._touchHandlers.jump);
    buttons.net.addEventListener('touchstart', this._touchHandlers.net);
  }

  onCycleLetter(direction) {
    const now = this.time.now;
    if (now - this._lastInputTime < INPUT_COOLDOWN) return;
    this._lastInputTime = now;

    if (this._okFocused) {
      // If on OK, cycling moves back to letters
      this._okFocused = false;
      this.updateOkButton();
      this.updateSlotVisuals();
      return;
    }

    if (this.cursorPos >= MAX_NAME_LEN) return;

    let idx = this.charIndices[this.cursorPos];
    idx = (idx + direction + CHARS.length) % CHARS.length;
    this.charIndices[this.cursorPos] = idx;
    this.nameChars[this.cursorPos] = CHARS[idx];
    this.updateSlotVisuals();
    this.playTick();
    this.resetAutoSubmit();
  }

  onConfirm() {
    const now = this.time.now;
    if (now - this._lastInputTime < INPUT_COOLDOWN) return;
    this._lastInputTime = now;

    if (this._okFocused) {
      // Second press on OK = submit
      this.submitName();
      return;
    }

    // If current slot has a letter, advance cursor
    if (this.nameChars[this.cursorPos]) {
      if (this.cursorPos < MAX_NAME_LEN - 1) {
        this.cursorPos++;
        this.updateSlotVisuals();
      } else {
        // At last slot, move focus to OK
        this._okFocused = true;
        this.updateOkButton();
        this.updateSlotVisuals();
      }
    } else if (this.cursorPos > 0) {
      // Empty slot but has previous chars — move to OK (short name)
      this._okFocused = true;
      this.updateOkButton();
      this.updateSlotVisuals();
    }
    this.resetAutoSubmit();
  }

  onDelete() {
    const now = this.time.now;
    if (now - this._lastInputTime < INPUT_COOLDOWN) return;
    this._lastInputTime = now;

    if (this._okFocused) {
      this._okFocused = false;
      this.updateOkButton();
      this.updateSlotVisuals();
      return;
    }

    // Clear current slot and move back
    if (this.nameChars[this.cursorPos]) {
      this.nameChars[this.cursorPos] = '';
      this.charIndices[this.cursorPos] = 0;
    } else if (this.cursorPos > 0) {
      this.cursorPos--;
      this.nameChars[this.cursorPos] = '';
      this.charIndices[this.cursorPos] = 0;
    }
    this.updateSlotVisuals();
    this.playTick();
    this.resetAutoSubmit();
  }

  updateSlotVisuals() {
    for (let i = 0; i < MAX_NAME_LEN; i++) {
      const txt = this.slotTexts[i];
      const char = this.nameChars[i];

      if (i === this.cursorPos && !this._okFocused) {
        // Active slot
        txt.setText(char || CHARS[this.charIndices[i]]);
        txt.setFill('#00ffff');
        txt.setScale(1);
        // Pulse active slot
        this.tweens.killTweensOf(txt);
        this.tweens.add({
          targets: txt, scale: { from: 1.0, to: 1.15 },
          duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      } else if (char) {
        // Filled slot
        txt.setText(char);
        txt.setFill('#ffffff');
        this.tweens.killTweensOf(txt);
        txt.setScale(1);
      } else {
        // Empty slot
        txt.setText('_');
        txt.setFill('#8b7daa');
        this.tweens.killTweensOf(txt);
        txt.setScale(1);
      }
    }
  }

  updateOkButton() {
    if (this._okFocused) {
      this.okBg.setFillStyle(0xffd700);
      this.okBg.setStrokeStyle(2, 0xffee88);
      this.okText.setFill('#1a0e2e');
      this.tweens.killTweensOf(this.okBg);
      this.tweens.add({
        targets: this.okBg, scaleX: { from: 1.0, to: 1.08 }, scaleY: { from: 1.0, to: 1.08 },
        duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    } else {
      this.okBg.setFillStyle(0x333355);
      this.okBg.setStrokeStyle(2, 0x555577);
      this.okText.setFill('#888888');
      this.tweens.killTweensOf(this.okBg);
      this.okBg.setScale(1);
    }
  }

  playTick() {
    const sfx = this.registry.get('sfx');
    if (sfx) sfx.play('tick');
  }

  resetAutoSubmit() {
    if (this._autoSubmitTimer) {
      this._autoSubmitTimer.remove(false);
    }
    this._autoSubmitTimer = this.time.delayedCall(AUTO_SUBMIT_MS, () => {
      this.submitName();
    });
    this.autoSubmitText.setText('');
  }

  getEnteredName() {
    const name = this.nameChars.join('').trim();
    return name.length > 0 ? name : 'PUP';
  }

  submitName() {
    if (this._hasSubmitted) return;
    this._hasSubmitted = true;

    // Clean up input
    this.cleanupInput();

    const name = this.getEnteredName();

    // Flash the name
    this.slotTexts.forEach(t => {
      this.tweens.killTweensOf(t);
      t.setFill('#ffffff');
    });

    // Submit to API
    submitScore(name, this.playerTime, this.playerTreats, this.playerKitties)
      .then(boards => {
        if (!this._alive) return;

        // Brief delay for the flash effect
        this.time.delayedCall(600, () => {
          if (!this._alive) return;
          this.cameras.main.fadeOut(300);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            if (!this._alive) return;
            this.scene.start('LeaderboardScene', {
              boards,
              playerName: name,
              fromMenu: false,
            });
          });
        });
      });
  }

  cleanupInput() {
    // Remove touch handlers
    const buttons = this.registry.get('touchButtons');
    if (buttons && this._touchHandlers) {
      buttons.left.removeEventListener('touchstart', this._touchHandlers.left);
      buttons.right.removeEventListener('touchstart', this._touchHandlers.right);
      buttons.jump.removeEventListener('touchstart', this._touchHandlers.jump);
      buttons.net.removeEventListener('touchstart', this._touchHandlers.net);
      this._touchHandlers = null;
    }

    if (this._autoSubmitTimer) {
      this._autoSubmitTimer.remove(false);
      this._autoSubmitTimer = null;
    }
    if (this._countdownEvent) {
      this._countdownEvent.destroy();
      this._countdownEvent = null;
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

import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, TILE_SIZE,
  PLAYER_SPEED, JUMP_VELOCITY, BOUNCE_VELOCITY, INVINCIBILITY_MS,
  BOSS_CATCH_WINDOW, BOSS_CATCHES_TO_WIN,
  LEVELS, COLORS,
} from '../config/constants.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data) {
    const state = this.registry.get('state');
    this.levelIndex = data.level ?? state.currentLevel;
    this.levelData = LEVELS[this.levelIndex];
    this.isInvincible = false;
    this.touchIntent = { left: false, right: false, jump: false };
    this.pendingTimers = [];

    // Boss state
    this.bossState = 'inactive';
    this.bossCatches = 0;
    this.bossActive = false;
  }

  create() {
    const level = this.levelData;

    // Background
    this.cameras.main.setBackgroundColor(level.background);

    // Create platforms
    this.platforms = this.physics.add.staticGroup();
    level.platforms.forEach((p) => {
      const plat = this.add.rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, level.groundColor);
      this.physics.add.existing(plat, true);
      this.platforms.add(plat);
    });

    // Create collectibles
    this.collectibles = this.physics.add.group();
    level.collectibles.forEach((c) => {
      const treat = this.physics.add.image(c.x, c.y, 'treat');
      treat.body.setAllowGravity(false);
      treat.body.setImmovable(true);
      this.collectibles.add(treat);

      // Gentle floating animation
      this.tweens.add({
        targets: treat,
        y: c.y - 6,
        duration: 1000 + Math.random() * 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });

    // Create enemies (kitties)
    this.enemies = this.physics.add.group();
    level.enemies.forEach((e) => {
      const kitty = this.physics.add.sprite(e.x, e.y, 'kitty');
      kitty.body.setAllowGravity(false);
      kitty.body.setImmovable(true);
      kitty.patrolLeft = e.patrolLeft;
      kitty.patrolRight = e.patrolRight;
      kitty.speed = 40 + Math.random() * 20;
      kitty.setVelocityX(kitty.speed);
      this.enemies.add(kitty);
    });

    // Create player (Chase)
    this.player = this.physics.add.sprite(100, 400, 'player');
    this.player.setScale(1.5);
    this.player.setBounce(0.1);
    this.player.setCollideWorldBounds(false);
    this.player.body.setSize(20, 28);
    this.player.body.setOffset(6, 4);

    // Collisions
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.overlap(this.player, this.collectibles, this.collectTreat, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitEnemy, null, this);

    // Level exit zone
    this.exitZone = this.add.rectangle(level.exitX, GAME_HEIGHT / 2, TILE_SIZE * 2, GAME_HEIGHT, 0x00ff00, 0);
    this.physics.add.existing(this.exitZone, true);
    this.physics.add.overlap(this.player, this.exitZone, this.reachExit, null, this);
    this.exitReached = false;

    // Boss setup
    if (level.hasBoss) {
      this.createBoss(level.bossX);
    }

    // Camera
    const worldWidth = level.exitX + 200;
    this.physics.world.setBounds(0, 0, worldWidth, GAME_HEIGHT);
    this.cameras.main.setBounds(0, 0, worldWidth, GAME_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(200, 100);
    this.cameras.main.fadeIn(500, 0, 0, 0);

    // Keyboard input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Touch controls
    this.createTouchControls();

    // Launch UI scene
    this.scene.launch('UIScene');

    // Emit initial state
    const state = this.registry.get('state');
    this.game.events.emit('score-changed', state.treatsCollected);

    // Auto-pause on visibility change
    this.game.events.on('hidden', this.onHidden, this);
    this.game.events.on('visible', this.onVisible, this);
  }

  createTouchControls() {
    if (!this.sys.game.device.input.touch) return;

    const btnAlpha = 0.6;
    const btnAlphaActive = 0.9;
    const bottomY = GAME_HEIGHT - 50;

    // Left arrow
    const leftBtn = this.add.image(70, bottomY, 'arrow-left')
      .setScrollFactor(0)
      .setAlpha(btnAlpha)
      .setInteractive()
      .setDepth(100);

    leftBtn.on('pointerdown', () => {
      this.touchIntent.left = true;
      leftBtn.setAlpha(btnAlphaActive);
    });
    leftBtn.on('pointerup', () => {
      this.touchIntent.left = false;
      leftBtn.setAlpha(btnAlpha);
    });
    leftBtn.on('pointerout', () => {
      this.touchIntent.left = false;
      leftBtn.setAlpha(btnAlpha);
    });

    // Right arrow
    const rightBtn = this.add.image(170, bottomY, 'arrow-right')
      .setScrollFactor(0)
      .setAlpha(btnAlpha)
      .setInteractive()
      .setDepth(100);

    rightBtn.on('pointerdown', () => {
      this.touchIntent.right = true;
      rightBtn.setAlpha(btnAlphaActive);
    });
    rightBtn.on('pointerup', () => {
      this.touchIntent.right = false;
      rightBtn.setAlpha(btnAlpha);
    });
    rightBtn.on('pointerout', () => {
      this.touchIntent.right = false;
      rightBtn.setAlpha(btnAlpha);
    });

    // Jump button
    const jumpBtn = this.add.image(GAME_WIDTH - 70, bottomY, 'jump-button')
      .setScrollFactor(0)
      .setAlpha(btnAlpha)
      .setInteractive()
      .setDepth(100);

    jumpBtn.on('pointerdown', () => {
      this.touchIntent.jump = true;
      jumpBtn.setAlpha(btnAlphaActive);
    });
    jumpBtn.on('pointerup', () => {
      this.touchIntent.jump = false;
      jumpBtn.setAlpha(btnAlpha);
    });
    jumpBtn.on('pointerout', () => {
      this.touchIntent.jump = false;
      jumpBtn.setAlpha(btnAlpha);
    });
  }

  createBoss(bossX) {
    // Skye in a cage
    this.skye = this.add.image(bossX + 300, GAME_HEIGHT - 130, 'skye').setScale(2);

    // Cage bars
    const cage = this.add.graphics();
    cage.lineStyle(3, 0x888888);
    for (let i = 0; i < 5; i++) {
      const x = bossX + 280 + i * 12;
      cage.lineBetween(x, GAME_HEIGHT - 160, x, GAME_HEIGHT - 100);
    }
    cage.lineBetween(bossX + 278, GAME_HEIGHT - 160, bossX + 330, GAME_HEIGHT - 160);
    cage.lineBetween(bossX + 278, GAME_HEIGHT - 100, bossX + 330, GAME_HEIGHT - 100);

    // Boss character
    this.boss = this.physics.add.sprite(bossX, GAME_HEIGHT - 100, 'boss');
    this.boss.setScale(1);
    this.boss.body.setAllowGravity(false);
    this.boss.body.setImmovable(true);
    this.bossState = 'waiting';

    // Boss trigger zone (when player gets close)
    this.bossTrigger = this.add.rectangle(bossX - 200, GAME_HEIGHT / 2, TILE_SIZE * 2, GAME_HEIGHT, 0xff0000, 0);
    this.physics.add.existing(this.bossTrigger, true);
    this.physics.add.overlap(this.player, this.bossTrigger, this.startBossFight, null, this);

    // Paw button (hidden initially)
    this.pawButton = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 'paw-button')
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false)
      .setInteractive();

    this.pawButton.on('pointerdown', () => {
      this.catchBoss();
    });

    // Also allow spacebar/up to catch during vulnerable state
    this.bossKeyHandler = null;
  }

  startBossFight() {
    if (this.bossState !== 'waiting') return;
    this.bossState = 'running';
    this.bossActive = true;
    this.bossTrigger.destroy();
    this.bossCycle();
  }

  bossCycle() {
    if (this.bossState === 'defeated') return;

    // Boss runs away briefly
    this.bossState = 'running';
    this.boss.setVelocityX(80);

    const tiredTimer = this.time.delayedCall(1500, () => {
      if (this.bossState === 'defeated') return;

      // Boss gets tired and stops
      this.bossState = 'tired';
      this.boss.setVelocityX(0);

      // Show paw button
      this.pawButton.setVisible(true);
      this.tweens.add({
        targets: this.pawButton,
        scale: 1.15,
        duration: 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      // Also allow keyboard catch
      this.bossKeyHandler = () => {
        if (this.bossState === 'tired') {
          this.catchBoss();
        }
      };

      // Timeout - boss recovers after catch window
      const recoverTimer = this.time.delayedCall(BOSS_CATCH_WINDOW, () => {
        if (this.bossState !== 'tired') return;
        this.pawButton.setVisible(false);
        this.tweens.killTweensOf(this.pawButton);
        this.pawButton.setScale(1);
        this.bossKeyHandler = null;
        this.bossCycle();
      });
      this.pendingTimers.push(recoverTimer);
    });
    this.pendingTimers.push(tiredTimer);
  }

  catchBoss() {
    if (this.bossState !== 'tired') return;

    this.bossCatches++;
    this.pawButton.setVisible(false);
    this.tweens.killTweensOf(this.pawButton);
    this.pawButton.setScale(1);
    this.bossKeyHandler = null;

    // Celebration burst
    this.cameras.main.shake(200, 0.005);

    // Flash boss
    this.boss.setTint(0xff0000);
    this.time.delayedCall(200, () => {
      if (this.boss) this.boss.clearTint();
    });

    if (this.bossCatches >= BOSS_CATCHES_TO_WIN) {
      this.bossDefeated();
    } else {
      // Boss shrinks a bit each catch
      this.boss.setScale(1 - this.bossCatches * 0.15);
      this.bossCycle();
    }
  }

  bossDefeated() {
    this.bossState = 'defeated';
    this.cancelAllTimers();

    // Boss disappears with poof
    this.tweens.add({
      targets: this.boss,
      alpha: 0,
      scale: 0.1,
      duration: 500,
      onComplete: () => {
        this.boss.destroy();
      },
    });

    // Free Skye - remove cage, celebration
    this.time.delayedCall(600, () => {
      // Skye bounce celebration
      this.tweens.add({
        targets: this.skye,
        y: this.skye.y - 30,
        duration: 300,
        yoyo: true,
        repeat: 3,
        ease: 'Bounce.easeOut',
      });

      // Victory after celebration
      this.time.delayedCall(2000, () => {
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.cleanup();
          this.scene.stop('UIScene');
          this.scene.start('VictoryScene');
        });
      });
    });
  }

  collectTreat(player, treat) {
    treat.destroy();
    const state = this.registry.get('state');
    state.addScore(10);
    this.game.events.emit('score-changed', state.treatsCollected);

    // Sparkle effect
    const sparkle = this.add.circle(treat.x, treat.y, 12, COLORS.TREAT_GOLD, 0.8);
    this.tweens.add({
      targets: sparkle,
      scale: 2,
      alpha: 0,
      duration: 300,
      onComplete: () => sparkle.destroy(),
    });
  }

  hitEnemy(player, enemy) {
    if (this.isInvincible) return;

    this.isInvincible = true;

    // Bounce player back
    const bounceDir = player.x < enemy.x ? -1 : 1;
    player.setVelocityX(bounceDir * 200);
    player.setVelocityY(BOUNCE_VELOCITY);

    // Camera shake (gentle)
    this.cameras.main.shake(150, 0.003);

    // Flashing invincibility effect
    this.tweens.add({
      targets: player,
      alpha: 0.3,
      duration: 150,
      yoyo: true,
      repeat: 7,
      onComplete: () => {
        player.setAlpha(1);
      },
    });

    const invTimer = this.time.delayedCall(INVINCIBILITY_MS, () => {
      this.isInvincible = false;
    });
    this.pendingTimers.push(invTimer);
  }

  reachExit() {
    if (this.exitReached) return;
    this.exitReached = true;

    const state = this.registry.get('state');
    const nextLevel = this.levelIndex + 1;

    if (nextLevel >= LEVELS.length) {
      // Game won (shouldn't happen for non-boss levels, but safety check)
      this.cameras.main.fadeOut(500);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.cleanup();
        this.scene.stop('UIScene');
        this.scene.start('VictoryScene');
      });
      return;
    }

    // Level complete - brief celebration then advance
    state.currentLevel = nextLevel;

    // Flash screen with celebration color
    this.cameras.main.flash(300, 255, 215, 0);

    // Brief pause then transition
    this.time.delayedCall(800, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.cleanup();
        this.scene.start('GameScene', { level: nextLevel });
      });
    });
  }

  update() {
    if (!this.player || !this.player.body) return;

    const player = this.player;
    const onGround = player.body.onFloor();

    // Accumulate input intent from keyboard + touch
    let moveX = 0;
    let wantsJump = false;

    // Keyboard
    if (this.cursors.left.isDown) moveX -= 1;
    if (this.cursors.right.isDown) moveX += 1;
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      wantsJump = true;
    }

    // Touch
    if (this.touchIntent.left) moveX -= 1;
    if (this.touchIntent.right) moveX += 1;
    if (this.touchIntent.jump) {
      wantsJump = true;
      this.touchIntent.jump = false; // consume jump intent
    }

    // Clamp so both inputs don't double speed
    moveX = Phaser.Math.Clamp(moveX, -1, 1);

    // Apply movement
    player.setVelocityX(moveX * PLAYER_SPEED);

    // Flip sprite based on direction
    if (moveX < 0) player.setFlipX(true);
    else if (moveX > 0) player.setFlipX(false);

    // Jump (only on ground)
    if (wantsJump && onGround) {
      player.setVelocityY(JUMP_VELOCITY);
    }

    // Variable-height jump: release early = shorter jump
    if ((this.cursors.up.isUp && this.spaceKey.isUp && !this.touchIntent.jump) &&
        player.body.velocity.y < 0) {
      player.setVelocityY(player.body.velocity.y * 0.85);
    }

    // Boss keyboard catch
    if (this.bossKeyHandler && (Phaser.Input.Keyboard.JustDown(this.spaceKey) || Phaser.Input.Keyboard.JustDown(this.cursors.up))) {
      this.bossKeyHandler();
    }

    // Enemy patrol behavior
    this.enemies.getChildren().forEach((kitty) => {
      if (kitty.x <= kitty.patrolLeft) {
        kitty.setVelocityX(kitty.speed);
        kitty.setFlipX(false);
      } else if (kitty.x >= kitty.patrolRight) {
        kitty.setVelocityX(-kitty.speed);
        kitty.setFlipX(true);
      }
    });

    // Safety: if player falls below world, teleport back up
    if (player.y > GAME_HEIGHT + 50) {
      player.setPosition(player.x, GAME_HEIGHT - 100);
      player.setVelocity(0, 0);
    }
  }

  cancelAllTimers() {
    this.pendingTimers.forEach((t) => {
      if (t && t.remove) t.remove(false);
    });
    this.pendingTimers = [];
  }

  cleanup() {
    this.cancelAllTimers();
    this.game.events.off('hidden', this.onHidden, this);
    this.game.events.off('visible', this.onVisible, this);
  }

  onHidden() {
    this.scene.pause();
  }

  onVisible() {
    this.scene.resume();
  }

  shutdown() {
    this.cleanup();
  }
}

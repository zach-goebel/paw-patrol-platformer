import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, TILE_SIZE,
  PLAYER_SPEED, JUMP_VELOCITY, DOUBLE_JUMP_VELOCITY,
  BOUNCE_VELOCITY, INVINCIBILITY_MS, MAX_HEALTH,
  PAW_ATTACK_DURATION, PAW_ATTACK_COOLDOWN, PAW_ATTACK_RANGE,
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
    this.touchIntent = { left: false, right: false, jump: false, paw: false };
    this.pendingTimers = [];

    // Double jump
    this.jumpsRemaining = 2;
    this.wasOnGround = true;

    // Paw attack
    this.pawOnCooldown = false;
    this.pawHitbox = null;

    // Boss state
    this.bossState = 'inactive';
    this.bossCatches = 0;
    this.bossActive = false;
    this.bossHP = this.levelData.bossHP || 3;

    // Health - reset per level
    state.resetHealth();
  }

  create() {
    const level = this.levelData;
    const sfx = this.registry.get('sfx');

    // Background - layered parallax
    this.createBackground(level);

    // Create platforms with themed visuals
    this.platforms = this.physics.add.staticGroup();
    level.platforms.forEach((p, i) => {
      const isGround = i === 0;
      const plat = this.add.rectangle(
        p.x + p.w / 2, p.y + p.h / 2, p.w, p.h,
        isGround ? level.groundColor : level.platformColor
      );

      // Add top highlight to non-ground platforms
      if (!isGround) {
        const highlight = this.add.rectangle(
          p.x + p.w / 2, p.y + 2, p.w, 4,
          Phaser.Display.Color.GetColor(
            Math.min(255, ((level.platformColor >> 16) & 0xff) + 40),
            Math.min(255, ((level.platformColor >> 8) & 0xff) + 40),
            Math.min(255, (level.platformColor & 0xff) + 40)
          )
        );
        highlight.setDepth(1);
      }

      this.physics.add.existing(plat, true);
      this.platforms.add(plat);
    });

    // Create collectibles
    this.collectibles = this.physics.add.group();
    level.collectibles.forEach((c) => {
      const treat = this.physics.add.image(c.x, c.y, 'treat');
      treat.body.setAllowGravity(false);
      treat.body.setImmovable(true);
      treat.setDepth(5);
      this.collectibles.add(treat);

      // Gentle floating animation - use display offset to avoid physics issues
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
      // Adjust y so 64x64 kitty sits on ground (origin is center)
      const kitty = this.physics.add.sprite(e.x, e.y - 16, 'kitty');
      kitty.body.setAllowGravity(false);
      kitty.body.setImmovable(true);
      kitty.patrolLeft = e.patrolLeft;
      kitty.patrolRight = e.patrolRight;
      kitty.speed = 40 + Math.random() * 20;
      kitty.setVelocityX(kitty.speed);
      kitty.setDepth(5);
      this.enemies.add(kitty);
    });

    // Create player (Chase) — 64x64 sprite
    this.player = this.physics.add.sprite(100, 400, 'player');
    this.player.setBounce(0.1);
    this.player.setCollideWorldBounds(false);
    this.player.body.setSize(36, 52);
    this.player.body.setOffset(14, 10);
    this.player.setDepth(10);

    // Collisions
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.overlap(this.player, this.collectibles, this.collectTreat, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.playerEnemyCollision, null, this);

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
    this.pawKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);

    // Touch controls
    this.createTouchControls();

    // Launch UI scene
    this.scene.launch('UIScene');

    // Emit initial state
    const state = this.registry.get('state');
    this.game.events.emit('score-changed', state.treatsCollected);
    this.game.events.emit('health-changed', state.health);

    // Level name display
    this.showLevelName(level.name);

    // Auto-pause on visibility change
    this.game.events.on('hidden', this.onHidden, this);
    this.game.events.on('visible', this.onVisible, this);
  }

  createBackground(level) {
    const bgKey = `bg-${level.key}`;
    const worldWidth = level.exitX + 200;

    // Tile the background image across the world width
    const bgImage = this.textures.get(bgKey);
    const bgWidth = bgImage.getSourceImage().width;
    const tilesNeeded = Math.ceil(worldWidth / bgWidth) + 1;

    for (let i = 0; i < tilesNeeded; i++) {
      const bg = this.add.image(i * bgWidth, 0, bgKey)
        .setOrigin(0, 0)
        .setDepth(-10);

      // Slow scroll for parallax feel
      bg.setScrollFactor(0.3);
    }

    // Fallback solid color behind the tiled images
    this.cameras.main.setBackgroundColor(level.background);
  }

  showLevelName(name) {
    const nameText = this.add.text(GAME_WIDTH / 2, 60, name, {
      fontSize: '28px',
      fill: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50).setAlpha(0);

    this.tweens.add({
      targets: nameText,
      alpha: 1,
      duration: 500,
      hold: 2000,
      yoyo: true,
      onComplete: () => nameText.destroy(),
    });
  }

  createTouchControls() {
    const btnAlpha = 0.6;
    const btnAlphaActive = 0.9;
    const bottomY = GAME_HEIGHT - 50;

    // Left arrow
    const leftBtn = this.add.image(70, bottomY, 'arrow-left')
      .setScrollFactor(0).setAlpha(btnAlpha).setInteractive().setDepth(100);

    leftBtn.on('pointerdown', () => { this.touchIntent.left = true; leftBtn.setAlpha(btnAlphaActive); });
    leftBtn.on('pointerup', () => { this.touchIntent.left = false; leftBtn.setAlpha(btnAlpha); });
    leftBtn.on('pointerout', () => { this.touchIntent.left = false; leftBtn.setAlpha(btnAlpha); });

    // Right arrow
    const rightBtn = this.add.image(170, bottomY, 'arrow-right')
      .setScrollFactor(0).setAlpha(btnAlpha).setInteractive().setDepth(100);

    rightBtn.on('pointerdown', () => { this.touchIntent.right = true; rightBtn.setAlpha(btnAlphaActive); });
    rightBtn.on('pointerup', () => { this.touchIntent.right = false; rightBtn.setAlpha(btnAlpha); });
    rightBtn.on('pointerout', () => { this.touchIntent.right = false; rightBtn.setAlpha(btnAlpha); });

    // Jump button
    const jumpBtn = this.add.image(GAME_WIDTH - 70, bottomY, 'jump-button')
      .setScrollFactor(0).setAlpha(btnAlpha).setInteractive().setDepth(100);

    jumpBtn.on('pointerdown', () => { this.touchIntent.jump = true; jumpBtn.setAlpha(btnAlphaActive); });
    jumpBtn.on('pointerup', () => { this.touchIntent.jump = false; jumpBtn.setAlpha(btnAlpha); });
    jumpBtn.on('pointerout', () => { this.touchIntent.jump = false; jumpBtn.setAlpha(btnAlpha); });

    // Paw attack button (touch only)
    const pawBtn = this.add.image(GAME_WIDTH - 170, bottomY, 'paw-touch')
      .setScrollFactor(0).setAlpha(btnAlpha).setInteractive().setDepth(100);

    pawBtn.on('pointerdown', () => { this.touchIntent.paw = true; pawBtn.setAlpha(btnAlphaActive); });
    pawBtn.on('pointerup', () => { pawBtn.setAlpha(btnAlpha); });
    pawBtn.on('pointerout', () => { pawBtn.setAlpha(btnAlpha); });
  }

  // --- BOSS ---

  createBoss(bossX) {
    const level = this.levelData;

    // Skye in a cage (only in final level)
    if (level.hasSkye) {
      this.skye = this.add.image(bossX + 300, GAME_HEIGHT - 130, 'skye').setDepth(5);

      // Cage bars
      this.cageGraphics = this.add.graphics().setDepth(6);
      this.cageGraphics.lineStyle(3, 0x888888);
      for (let i = 0; i < 5; i++) {
        const x = bossX + 280 + i * 12;
        this.cageGraphics.lineBetween(x, GAME_HEIGHT - 160, x, GAME_HEIGHT - 100);
      }
      this.cageGraphics.lineBetween(bossX + 278, GAME_HEIGHT - 160, bossX + 330, GAME_HEIGHT - 160);
      this.cageGraphics.lineBetween(bossX + 278, GAME_HEIGHT - 100, bossX + 330, GAME_HEIGHT - 100);
    }

    // Boss barrier - blocks access to exit until boss is defeated
    this.bossBarrier = this.add.rectangle(bossX + 150, GAME_HEIGHT / 2, 16, GAME_HEIGHT, 0xff0000, 0);
    this.physics.add.existing(this.bossBarrier, true);
    this.physics.add.collider(this.player, this.bossBarrier);

    // Boss character
    this.boss = this.physics.add.sprite(bossX, GAME_HEIGHT - 100, 'boss');
    this.boss.setScale(1);
    this.boss.body.setAllowGravity(false);
    this.boss.body.setImmovable(true);
    this.boss.setDepth(10);
    this.bossState = 'waiting';
    this.bossStartX = bossX;

    // Boss trigger zone
    this.bossTrigger = this.add.rectangle(bossX - 200, GAME_HEIGHT / 2, TILE_SIZE * 2, GAME_HEIGHT, 0xff0000, 0);
    this.physics.add.existing(this.bossTrigger, true);
    this.physics.add.overlap(this.player, this.bossTrigger, this.startBossFight, null, this);

    // Boss health tracking
    this.bossHitsRemaining = this.bossHP;
    this.bossPlayerHits = 0;
  }

  startBossFight() {
    if (this.bossState !== 'waiting') return;
    this.bossState = 'approaching';
    this.bossActive = true;
    this.bossTrigger.destroy();
    this.bossCycle();
  }

  bossCycle() {
    if (this.bossState === 'defeated') return;

    // Boss approaches Chase
    this.bossState = 'approaching';
    const bossSpeed = this.levelData.bossSpeed || 80;

    // Boss moves toward player
    this.bossApproachTimer = this.time.addEvent({
      delay: 50,
      repeat: -1,
      callback: () => {
        if (this.bossState !== 'approaching' || !this.boss || !this.player) return;
        const dir = this.player.x < this.boss.x ? -1 : 1;
        this.boss.setVelocityX(dir * bossSpeed);
        this.boss.setFlipX(dir < 0);
      },
    });
    this.pendingTimers.push(this.bossApproachTimer);

    // Boss collision with player = damage
    if (!this.bossCollider) {
      this.bossCollider = this.physics.add.overlap(this.player, this.boss, this.bossHitPlayer, null, this);
    }

    // After chasing for 2.5s, boss gets tired
    const tiredTimer = this.time.delayedCall(2500, () => {
      if (this.bossState === 'defeated') return;
      this.bossState = 'vulnerable';
      this.boss.setVelocityX(0);
      if (this.bossApproachTimer) this.bossApproachTimer.remove(false);

      // Visual indicator - boss flashes to show vulnerability
      this.boss.setTint(0xffff00);
      this.tweens.add({
        targets: this.boss,
        alpha: 0.6,
        duration: 300,
        yoyo: true,
        repeat: -1,
      });

      // Show paw prompt
      this.bossPrompt = this.add.text(this.boss.x, this.boss.y - 60, 'USE PAW! (X)', {
        fontSize: '16px',
        fill: '#ffff00',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(50);

      this.tweens.add({
        targets: this.bossPrompt,
        y: this.boss.y - 70,
        duration: 500,
        yoyo: true,
        repeat: -1,
      });

      // Recover after 3s if not hit
      const recoverTimer = this.time.delayedCall(3000, () => {
        if (this.bossState !== 'vulnerable') return;
        this.endBossVulnerability();
        this.bossCycle();
      });
      this.pendingTimers.push(recoverTimer);
    });
    this.pendingTimers.push(tiredTimer);
  }

  bossHitPlayer() {
    if (this.bossState === 'defeated' || this.bossState === 'vulnerable') return;
    if (this.isInvincible) return;

    const state = this.registry.get('state');
    const sfx = this.registry.get('sfx');
    const remaining = state.takeDamage();
    this.game.events.emit('health-changed', remaining);
    if (sfx) sfx.play('hurt');

    this.isInvincible = true;

    // Bounce player back
    const bounceDir = this.player.x < this.boss.x ? -1 : 1;
    this.player.setVelocityX(bounceDir * 250);
    this.player.setVelocityY(BOUNCE_VELOCITY);

    this.cameras.main.shake(150, 0.005);

    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 150,
      yoyo: true,
      repeat: 7,
      onComplete: () => this.player.setAlpha(1),
    });

    const invTimer = this.time.delayedCall(INVINCIBILITY_MS, () => {
      this.isInvincible = false;
    });
    this.pendingTimers.push(invTimer);

    if (remaining <= 0) {
      this.restartLevel();
    }
  }

  hitBossWithPaw() {
    if (this.bossState !== 'vulnerable') return;

    const sfx = this.registry.get('sfx');
    if (sfx) sfx.play('boss-hit');

    this.bossHitsRemaining--;
    this.endBossVulnerability();

    // Flash boss red
    this.boss.setTint(0xff0000);
    this.cameras.main.shake(200, 0.005);
    this.time.delayedCall(200, () => {
      if (this.boss) this.boss.clearTint();
    });

    if (this.bossHitsRemaining <= 0) {
      this.bossDefeated();
    } else {
      // Boss shrinks a bit each hit
      const scale = 1 - (this.bossHP - this.bossHitsRemaining) * 0.15;
      this.boss.setScale(Math.max(0.4, scale));
      this.bossCycle();
    }
  }

  endBossVulnerability() {
    this.boss.clearTint();
    this.boss.setAlpha(1);
    this.tweens.killTweensOf(this.boss);
    if (this.bossPrompt) {
      this.bossPrompt.destroy();
      this.bossPrompt = null;
    }
  }

  bossDefeated() {
    this.bossState = 'defeated';
    this.cancelAllTimers();

    const sfx = this.registry.get('sfx');
    if (sfx) sfx.play('victory');

    // Remove barrier
    if (this.bossBarrier) this.bossBarrier.destroy();

    // Boss spins and flies off
    this.tweens.add({
      targets: this.boss,
      alpha: 0,
      scale: 0.1,
      angle: 720,
      y: this.boss.y - 200,
      duration: 800,
      ease: 'Power2',
      onComplete: () => this.boss.destroy(),
    });

    // Remove boss collider
    if (this.bossCollider) {
      this.physics.world.removeCollider(this.bossCollider);
      this.bossCollider = null;
    }

    // Free Skye if present
    if (this.levelData.hasSkye && this.skye) {
      this.time.delayedCall(600, () => {
        // Cage disappears
        if (this.cageGraphics) {
          this.tweens.add({
            targets: this.cageGraphics,
            alpha: 0,
            duration: 400,
          });
        }

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
    // Non-final bosses: path is now clear, player continues to exit
  }

  // --- PAW ATTACK ---

  doPawAttack() {
    if (this.pawOnCooldown) return;

    const sfx = this.registry.get('sfx');
    if (sfx) sfx.play('paw');

    this.pawOnCooldown = true;

    // Create a hitbox in front of Chase
    const dir = this.player.flipX ? -1 : 1;
    const hbX = this.player.x + dir * PAW_ATTACK_RANGE;
    const hbY = this.player.y;

    // Visual swipe effect
    const swipe = this.add.circle(hbX, hbY, 16, COLORS.PAW_RED, 0.6).setDepth(15);
    this.tweens.add({
      targets: swipe,
      scale: 1.8,
      alpha: 0,
      duration: PAW_ATTACK_DURATION,
      onComplete: () => swipe.destroy(),
    });

    // Temporary physics hitbox
    const hitbox = this.add.rectangle(hbX, hbY, 32, 32, 0xff0000, 0);
    this.physics.add.existing(hitbox, false);
    hitbox.body.setAllowGravity(false);

    // Check overlap with enemies
    const enemyOverlap = this.physics.add.overlap(hitbox, this.enemies, (hb, enemy) => {
      this.defeatEnemy(enemy);
    });

    // Check overlap with boss
    if (this.boss && this.bossState === 'vulnerable') {
      const bossOverlap = this.physics.add.overlap(hitbox, this.boss, () => {
        this.hitBossWithPaw();
        this.physics.world.removeCollider(bossOverlap);
      });

      this.time.delayedCall(PAW_ATTACK_DURATION, () => {
        this.physics.world.removeCollider(bossOverlap);
      });
    }

    // Remove hitbox after duration
    this.time.delayedCall(PAW_ATTACK_DURATION, () => {
      this.physics.world.removeCollider(enemyOverlap);
      hitbox.destroy();
    });

    // Cooldown
    this.time.delayedCall(PAW_ATTACK_COOLDOWN, () => {
      this.pawOnCooldown = false;
    });
  }

  // --- ENEMY INTERACTIONS ---

  defeatEnemy(enemy) {
    if (!enemy || !enemy.active) return;

    const sfx = this.registry.get('sfx');
    if (sfx) sfx.play('stomp');

    enemy.body.enable = false;

    // Spin and fly off
    this.tweens.add({
      targets: enemy,
      angle: 720,
      y: enemy.y - 200,
      x: enemy.x + (Math.random() > 0.5 ? 150 : -150),
      alpha: 0,
      scale: 0.3,
      duration: 600,
      ease: 'Power2',
      onComplete: () => enemy.destroy(),
    });
  }

  playerEnemyCollision(player, enemy) {
    if (!enemy.active || !enemy.body.enable) return;

    // Check if player is stomping (falling onto enemy from above)
    const isStomping = player.body.velocity.y > 0 &&
      player.body.bottom <= enemy.body.top + 16;

    if (isStomping) {
      // Stomp the kitty!
      this.defeatEnemy(enemy);
      // Bounce player up
      player.setVelocityY(BOUNCE_VELOCITY);
      this.jumpsRemaining = 2; // Reset double jump after stomp
    } else {
      // Side hit - take damage
      this.hitEnemy(player, enemy);
    }
  }

  hitEnemy(player, enemy) {
    if (this.isInvincible) return;

    const state = this.registry.get('state');
    const sfx = this.registry.get('sfx');
    const remaining = state.takeDamage();
    this.game.events.emit('health-changed', remaining);
    if (sfx) sfx.play('hurt');

    this.isInvincible = true;

    // Bounce player back
    const bounceDir = player.x < enemy.x ? -1 : 1;
    player.setVelocityX(bounceDir * 200);
    player.setVelocityY(BOUNCE_VELOCITY);

    this.cameras.main.shake(150, 0.003);

    this.tweens.add({
      targets: player,
      alpha: 0.3,
      duration: 150,
      yoyo: true,
      repeat: 7,
      onComplete: () => player.setAlpha(1),
    });

    const invTimer = this.time.delayedCall(INVINCIBILITY_MS, () => {
      this.isInvincible = false;
    });
    this.pendingTimers.push(invTimer);

    if (remaining <= 0) {
      this.restartLevel();
    }
  }

  restartLevel() {
    this.time.delayedCall(500, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.cleanup();
        this.scene.stop('UIScene');
        this.scene.restart({ level: this.levelIndex });
      });
    });
  }

  collectTreat(player, treat) {
    treat.destroy();
    const state = this.registry.get('state');
    const sfx = this.registry.get('sfx');
    state.addScore(10);
    this.game.events.emit('score-changed', state.treatsCollected);
    if (sfx) sfx.play('collect');

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

  reachExit() {
    if (this.exitReached) return;

    // Block exit if boss is alive
    if (this.levelData.hasBoss && this.bossState !== 'defeated') return;

    this.exitReached = true;

    const state = this.registry.get('state');
    const nextLevel = this.levelIndex + 1;

    if (nextLevel >= LEVELS.length) {
      this.cameras.main.fadeOut(500);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.cleanup();
        this.scene.stop('UIScene');
        this.scene.start('VictoryScene');
      });
      return;
    }

    state.currentLevel = nextLevel;
    this.cameras.main.flash(300, 255, 215, 0);

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

    // Reset jumps when landing
    if (onGround && !this.wasOnGround) {
      this.jumpsRemaining = 2;
    }
    this.wasOnGround = onGround;

    // Accumulate input intent from keyboard + touch
    let moveX = 0;
    let wantsJump = false;
    let wantsPaw = false;

    // Keyboard
    if (this.cursors.left.isDown) moveX -= 1;
    if (this.cursors.right.isDown) moveX += 1;
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      wantsJump = true;
    }
    if (Phaser.Input.Keyboard.JustDown(this.pawKey)) {
      wantsPaw = true;
    }

    // Touch
    if (this.touchIntent.left) moveX -= 1;
    if (this.touchIntent.right) moveX += 1;
    if (this.touchIntent.jump) {
      wantsJump = true;
      this.touchIntent.jump = false;
    }
    if (this.touchIntent.paw) {
      wantsPaw = true;
      this.touchIntent.paw = false;
    }

    // Clamp
    moveX = Phaser.Math.Clamp(moveX, -1, 1);

    // Apply movement
    player.setVelocityX(moveX * PLAYER_SPEED);

    // Flip sprite
    if (moveX < 0) player.setFlipX(true);
    else if (moveX > 0) player.setFlipX(false);

    // Jump (with double jump support)
    if (wantsJump && this.jumpsRemaining > 0) {
      const sfx = this.registry.get('sfx');
      if (this.jumpsRemaining === 2) {
        // First jump
        player.setVelocityY(JUMP_VELOCITY);
        if (sfx) sfx.play('jump');
      } else {
        // Double jump
        player.setVelocityY(DOUBLE_JUMP_VELOCITY);
        if (sfx) sfx.play('double-jump');
      }
      this.jumpsRemaining--;
    }

    // Variable-height jump
    if ((this.cursors.up.isUp && this.spaceKey.isUp && !this.touchIntent.jump) &&
        player.body.velocity.y < 0) {
      player.setVelocityY(player.body.velocity.y * 0.85);
    }

    // Paw attack
    if (wantsPaw) {
      this.doPawAttack();
    }

    // Enemy patrol behavior
    this.enemies.getChildren().forEach((kitty) => {
      if (!kitty.active || !kitty.body || !kitty.body.enable) return;
      if (kitty.x <= kitty.patrolLeft) {
        kitty.setVelocityX(kitty.speed);
        kitty.setFlipX(false);
      } else if (kitty.x >= kitty.patrolRight) {
        kitty.setVelocityX(-kitty.speed);
        kitty.setFlipX(true);
      }
    });

    // Safety: if player falls below world
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

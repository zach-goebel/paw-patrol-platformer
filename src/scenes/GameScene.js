import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, TILE_SIZE,
  PLAYER_SPEED, JUMP_VELOCITY, DOUBLE_JUMP_VELOCITY,
  BOUNCE_VELOCITY, INVINCIBILITY_MS, MAX_HEALTH,
  NET_SPEED, NET_MAX_DISTANCE, NET_COOLDOWN,
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
    this.cinematicMode = false;
    this.isTransitioning = false;
    this.touchIntent = { left: false, right: false, jump: false, net: false };
    this.pendingTimers = [];

    // Double jump
    this.jumpsRemaining = 2;
    this.wasOnGround = true;

    // Scene elapsed time (for timer)
    this._sceneElapsed = 0;

    // Net attack
    this.netOnCooldown = false;

    // Touch jump held state (for variable-height jump parity with keyboard)
    this._jumpHeld = false;

    // Boss state
    this.bossState = 'inactive';
    this.bossActive = false;
    this.bossHP = this.levelData.bossHP || 3;
    this.bossHitRegistered = false;

    // Player ground level (for boss Y-tracking)
    this.playerGroundY = GAME_HEIGHT - 100;

    // End sequence
    this.skyeReached = false;

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

    // Create collectibles with directControl to prevent tween/physics flicker
    this.collectibles = this.physics.add.group();
    level.collectibles.forEach((c) => {
      // Clamp Y above nearest platform surface
      let clampedY = c.y;
      level.platforms.forEach((p) => {
        if (c.x >= p.x && c.x <= p.x + p.w) {
          if (c.y > p.y - 16 && c.y < p.y + p.h) {
            clampedY = Math.min(clampedY, p.y - 20);
          }
        }
      });

      const treat = this.physics.add.image(c.x, clampedY, 'treat');
      treat.body.setAllowGravity(false);
      treat.body.setImmovable(true);
      treat.body.setDirectControl(true);
      treat.setDepth(5);
      this.collectibles.add(treat);

      this.tweens.add({
        targets: treat,
        y: clampedY - 6,
        duration: 1000 + Math.random() * 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });

    // Create enemies (kitties) with reduced hitbox
    this.enemies = this.physics.add.group();
    level.enemies.forEach((e) => {
      const kitty = this.physics.add.sprite(e.x, e.y - 16, 'kitty');
      kitty.body.setAllowGravity(false);
      kitty.body.setImmovable(true);
      kitty.body.setSize(40, 48);
      kitty.body.setOffset(12, 12);
      kitty.patrolLeft = e.patrolLeft;
      kitty.patrolRight = e.patrolRight;
      kitty.speed = 60 + Math.random() * 20;
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

    // Net projectile pool
    this.nets = this.physics.add.group({
      maxSize: 4,
      allowGravity: false,
    });

    // Collisions
    this.physics.add.collider(this.player, this.platforms, (player, platform) => {
      if (player.body.touching.down) {
        this.playerGroundY = platform.y - (platform.displayHeight / 2);
      }
    });
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.overlap(this.player, this.collectibles, this.collectTreat, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.playerEnemyCollision, null, this);

    // Net overlaps — persistent, checked against pool group
    this.physics.add.overlap(this.nets, this.enemies, (net, enemy) => {
      if (!net.active) return;
      net.setActive(false).setVisible(false);
      net.body.enable = false;
      this.defeatEnemy(enemy);
    });

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
    this.netKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);

    // Touch controls — only on touch devices
    const primaryIsCoarse = window.matchMedia('(pointer: coarse)').matches;
    const cannotHover = window.matchMedia('(hover: none)').matches;
    const hasTouchPoints = navigator.maxTouchPoints > 0;
    const anyCoarse = window.matchMedia('(any-pointer: coarse)').matches;
    this.isTouchDevice = (primaryIsCoarse && cannotHover) ||
      (anyCoarse && hasTouchPoints && window.innerWidth <= 1024);

    if (this.isTouchDevice) {
      this.createTouchControls();
    }

    // Launch UI scene
    this.scene.launch('UIScene');

    // Emit initial state
    const state = this.registry.get('state');
    this.game.events.emit('score-changed', state.treatsCollected);
    this.game.events.emit('health-changed', state.health);
    this.game.events.emit('kitty-captured', state.kittiesCaptured);

    // Level name display
    this.showLevelName(level.name);

    // Start gameplay music (only if not already playing — persists across levels)
    const audioManager = this.registry.get('audioManager');
    if (audioManager && audioManager.currentKey !== 'theme-gameplay') {
      audioManager.playMusic('theme-gameplay', { volume: 0.35, fadeIn: 600, fadeOut: 500 });
    }

    // Auto-pause on visibility change
    this.game.events.on('hidden', this.onHidden, this);
    this.game.events.on('visible', this.onVisible, this);
  }

  createBackground(level) {
    const bgKey = `bg-${level.key}`;
    const worldWidth = level.exitX + 200;

    const bgImage = this.textures.get(bgKey);
    const bgWidth = bgImage.getSourceImage().width;
    const tilesNeeded = Math.ceil(worldWidth / bgWidth) + 1;

    for (let i = 0; i < tilesNeeded; i++) {
      const bg = this.add.image(i * bgWidth, 0, bgKey)
        .setOrigin(0, 0)
        .setDepth(-10);
      bg.setScrollFactor(0.3);
    }

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
    const buttons = this.registry.get('touchButtons');
    if (!buttons) return;

    // D-pad
    buttons.left.addEventListener('touchstart', (e) => { e.preventDefault(); this.touchIntent.left = true; });
    buttons.left.addEventListener('touchend', () => { this.touchIntent.left = false; });
    buttons.left.addEventListener('touchcancel', () => { this.touchIntent.left = false; });

    buttons.right.addEventListener('touchstart', (e) => { e.preventDefault(); this.touchIntent.right = true; });
    buttons.right.addEventListener('touchend', () => { this.touchIntent.right = false; });
    buttons.right.addEventListener('touchcancel', () => { this.touchIntent.right = false; });

    // Jump — _jumpHeld tracks whether finger is on button (for variable-height jump)
    buttons.jump.addEventListener('touchstart', (e) => { e.preventDefault(); this.touchIntent.jump = true; this._jumpHeld = true; });
    buttons.jump.addEventListener('touchend', () => { this._jumpHeld = false; });
    buttons.jump.addEventListener('touchcancel', () => { this._jumpHeld = false; });

    // Net
    buttons.net.addEventListener('touchstart', (e) => { e.preventDefault(); this.touchIntent.net = true; });
    buttons.net.addEventListener('touchend', () => {});
    buttons.net.addEventListener('touchcancel', () => {});
  }

  // --- BOSS ---

  createBoss(bossX) {
    const level = this.levelData;

    // Skye in a cage (only in final level)
    if (level.hasSkye) {
      this.skye = this.add.image(bossX + 300, GAME_HEIGHT - 100, 'skye').setDepth(5);

      this.cageGraphics = this.add.graphics().setDepth(6);
      this.cageGraphics.lineStyle(3, 0x888888);
      for (let i = 0; i < 5; i++) {
        const x = bossX + 280 + i * 12;
        this.cageGraphics.lineBetween(x, GAME_HEIGHT - 130, x, GAME_HEIGHT - 70);
      }
      this.cageGraphics.lineBetween(bossX + 278, GAME_HEIGHT - 130, bossX + 330, GAME_HEIGHT - 130);
      this.cageGraphics.lineBetween(bossX + 278, GAME_HEIGHT - 70, bossX + 330, GAME_HEIGHT - 70);

      // Fail-safe overlap at cage — if Chase reaches Skye and boss is gone, force rescue
      const cageZone = this.add.rectangle(this.skye.x, this.skye.y, 120, 120, 0x00ff00, 0);
      this.physics.add.existing(cageZone, true);
      this.physics.add.overlap(
        this.player,
        cageZone,
        () => {
          if (this.skyeReached || !this.bossActive) return;
          if (!this.isBossGone()) return;
          // Boss is gone but defeat didn't fire properly — force it
          if (this.bossState !== 'defeated') {
            this.bossGoneFailsafe();
          }
          // If rescue hasn't started yet, start it now
          if (!this.skyeZone) {
            this.startSkyeRescue();
          }
        },
        null,
        this
      );
    }

    // Boss barrier — only for full boss fight (stage 3)
    if (!level.miniBoss) {
      this.bossBarrier = this.add.rectangle(bossX + 150, GAME_HEIGHT / 2, 16, GAME_HEIGHT, 0xff0000, 0);
      this.physics.add.existing(this.bossBarrier, true);
      this.physics.add.collider(this.player, this.bossBarrier);
    }

    // Boss character
    this.boss = this.physics.add.sprite(bossX, GAME_HEIGHT - 100, 'boss');
    this.boss.setScale(1);
    this.boss.body.setAllowGravity(false);
    this.boss.body.setImmovable(true);
    this.boss.setDepth(10);
    this.bossState = 'waiting';
    this.bossStartX = bossX;

    // Boss trigger zone — starts the fight when player walks close
    this.bossTrigger = this.add.rectangle(bossX - 200, GAME_HEIGHT / 2, TILE_SIZE * 2, GAME_HEIGHT, 0xff0000, 0);
    this.physics.add.existing(this.bossTrigger, true);
    this.physics.add.overlap(this.player, this.bossTrigger, this.startBossFight, null, this);

    // Boss health tracking
    this.bossHitsRemaining = this.bossHP;

    // Net-vs-boss overlap with processCallback guard
    this.netBossOverlap = this.physics.add.overlap(
      this.nets,
      this.boss,
      (net) => {
        // Consume the net and register the hit
        net.setActive(false).setVisible(false);
        net.body.enable = false;
        this.hitBossWithNet();
      },
      (net) => {
        if (!net.active) return false;
        // Only allow hit if boss is vulnerable and no hit registered this window
        if (this.bossState === 'vulnerable' && !this.bossHitRegistered) {
          return true;
        }
        // Net hit non-vulnerable boss — consume and show blocked feedback
        net.setActive(false).setVisible(false);
        net.body.enable = false;
        if (this.boss && this.boss.active) {
          this.boss.setTint(0xaaaaaa);
          this.time.delayedCall(150, () => {
            if (this.boss && this.boss.active && this.bossState !== 'vulnerable') {
              this.boss.clearTint();
            }
          });
        }
        return false;
      },
      this
    );
  }

  startBossFight() {
    if (this.bossState !== 'waiting') return;
    this.bossActive = true;
    this.bossTrigger.destroy();

    // Switch to boss music
    const audioManager = this.registry.get('audioManager');
    if (audioManager) {
      audioManager.playMusic('theme-boss', { volume: 0.4, fadeIn: 300, fadeOut: 300 });
    }

    this.bossCycle();
  }

  // Cleans up all boss cycle timers
  clearBossTimers() {
    if (this.bossApproachTimer) {
      this.bossApproachTimer.remove(false);
      this.bossApproachTimer = null;
    }
    if (this._tiredTimer) {
      this._tiredTimer.remove(false);
      this._tiredTimer = null;
    }
    if (this._recoverTimer) {
      this._recoverTimer.remove(false);
      this._recoverTimer = null;
    }
  }

  // Clears vulnerability visuals (yellow tint, alpha pulse, prompt text)
  clearVulnerabilityVisuals() {
    if (this.boss && this.boss.active) {
      this.boss.clearTint();
      this.boss.setAlpha(1);
      this.tweens.killTweensOf(this.boss);
    }
    if (this.bossPrompt) {
      this.tweens.killTweensOf(this.bossPrompt);
      this.bossPrompt.destroy();
      this.bossPrompt = null;
    }
  }

  bossCycle() {
    if (this.bossState === 'defeated') return;

    this.clearBossTimers();

    this.bossState = 'approaching';
    this.bossHitRegistered = false;
    const bossSpeed = this.levelData.bossSpeed || 80;

    // Boss chases player (X only; Y tracked in update())
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

    // Boss contact = damage to player
    if (!this.bossCollider) {
      this.bossCollider = this.physics.add.overlap(this.player, this.boss, this.bossHitPlayer, null, this);
    }

    // After chasing, boss gets tired and becomes vulnerable
    const tiredDelay = this.levelData.miniBoss ? 1500 : 2500;
    this._tiredTimer = this.time.delayedCall(tiredDelay, () => {
      if (this.bossState === 'defeated') return;

      this.bossState = 'vulnerable';
      this.bossHitRegistered = false;
      this.boss.setVelocityX(0);
      if (this.bossApproachTimer) {
        this.bossApproachTimer.remove(false);
        this.bossApproachTimer = null;
      }

      // Yellow flash + alpha pulse to show vulnerability
      this.boss.setTint(0xffff00);
      this.tweens.add({
        targets: this.boss,
        alpha: 0.6,
        duration: 300,
        yoyo: true,
        repeat: -1,
      });

      // "USE NET!" prompt
      this.bossPrompt = this.add.text(this.boss.x, this.boss.y - 60, 'USE NET! (X)', {
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

      // If player doesn't hit within 3s, boss recovers and starts a new cycle
      this._recoverTimer = this.time.delayedCall(3000, () => {
        if (this.bossState !== 'vulnerable') return;
        this.clearVulnerabilityVisuals();
        this.bossCycle();
      });
      this.pendingTimers.push(this._recoverTimer);
    });
    this.pendingTimers.push(this._tiredTimer);
  }

  bossHitPlayer() {
    if (this.bossState === 'defeated' || this.bossState === 'vulnerable' || this.bossState === 'hit-stun') return;
    if (this.isInvincible || this.cinematicMode || this.isTransitioning) return;

    const state = this.registry.get('state');
    const sfx = this.registry.get('sfx');
    const remaining = state.takeDamage();
    this.game.events.emit('health-changed', remaining);
    if (sfx) sfx.play('hurt');

    this.isInvincible = true;

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
      onComplete: () => { if (this.player) this.player.setAlpha(1); },
    });

    const invTimer = this.time.delayedCall(INVINCIBILITY_MS, () => {
      this.isInvincible = false;
    });
    this.pendingTimers.push(invTimer);

    if (remaining <= 0) {
      this.restartLevel();
    }
  }

  hitBossWithNet() {
    // Gate: only register during vulnerability, once per window
    if (this.bossState !== 'vulnerable' || this.bossHitRegistered) return;

    // Lock out immediately — prevents any further hits this window
    this.bossHitRegistered = true;
    this.bossState = 'hit-stun';

    const sfx = this.registry.get('sfx');
    if (sfx) sfx.play('boss-hit');

    // Decrement and clear vulnerability visuals
    this.bossHitsRemaining--;
    this.clearBossTimers();
    this.clearVulnerabilityVisuals();

    // Red flash + camera shake
    this.boss.setTint(0xff0000);
    this.cameras.main.shake(300, 0.01);

    if (this.bossHitsRemaining <= 0) {
      // Final hit — play defeat SFX immediately here (belt-and-suspenders
      // with bossDefeated), ensuring it fires regardless of animation state
      if (sfx) sfx.play('sfx-boss-defeat');
      this.bossDefeated();
    } else {
      // Non-final hit — show damage reaction then restart cycle
      this.boss.body.enable = false;

      const t1 = this.time.delayedCall(200, () => {
        if (!this.boss || !this.boss.active) return;
        this.boss.setTint(0xffffff);
      });
      this.pendingTimers.push(t1);

      const t2 = this.time.delayedCall(400, () => {
        if (!this.boss || !this.boss.active) return;
        this.boss.clearTint();
        if (this.boss.body) this.boss.body.enable = true;

        // Shrink boss
        const hitsTaken = this.bossHP - this.bossHitsRemaining;
        const newScale = Math.max(0.4, 1 - hitsTaken * 0.15);
        this.tweens.add({
          targets: this.boss,
          scale: newScale,
          duration: 300,
          ease: 'Back.easeOut',
        });

        // Floating "X MORE HITS!" text
        const hitsText = this.bossHitsRemaining === 1 ? '1 MORE HIT!' : `${this.bossHitsRemaining} MORE HITS!`;
        const label = this.add.text(this.boss.x, this.boss.y - 70, hitsText, {
          fontSize: '20px',
          fill: '#ff4444',
          fontFamily: 'monospace',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 3,
        }).setOrigin(0.5).setDepth(50);

        this.tweens.add({
          targets: label,
          y: label.y - 30,
          alpha: 0,
          duration: 1500,
          ease: 'Power2',
          onComplete: () => label.destroy(),
        });

        // Pause, then restart the approach/vulnerable cycle
        const t3 = this.time.delayedCall(500, () => {
          if (this.bossState !== 'hit-stun') return;
          this.bossCycle();
        });
        this.pendingTimers.push(t3);
      });
      this.pendingTimers.push(t2);
    }
  }

  bossDefeated() {
    this.bossState = 'defeated';
    this.clearBossTimers();
    this.clearVulnerabilityVisuals();
    this.cancelAllTimers();
    this.cinematicMode = true;

    const sfx = this.registry.get('sfx');
    // Play boss defeat groan immediately, then victory arpeggio after a beat
    if (sfx) {
      sfx.play('sfx-boss-defeat');
    }
    this.time.delayedCall(400, () => {
      if (sfx) sfx.play('victory');
    });

    // Hard-stop music so the COMICALLY LOUD defeat SFX cuts through
    const audioManager = this.registry.get('audioManager');
    if (audioManager) {
      audioManager.stopMusic(0);

      if (this.levelData.miniBoss) {
        // Mini-boss: resume gameplay music after defeat SFX has had its moment
        this.time.delayedCall(1200, () => {
          audioManager.playMusic('theme-gameplay', { volume: 0.35, fadeIn: 800, fadeOut: 0 });
        });
      }
      // Final boss stays silent — victory fanfare plays when reaching Skye
    }

    // Remove boss-player collider
    if (this.bossCollider) {
      this.physics.world.removeCollider(this.bossCollider);
      this.bossCollider = null;
    }

    // Remove barrier
    if (this.bossBarrier) this.bossBarrier.destroy();

    this.boss.body.enable = false;

    if (this.levelData.miniBoss) {
      // Mini-boss (stages 1-2): flee right, then allow player to proceed
      this.tweens.add({
        targets: this.boss,
        x: this.boss.x + 600,
        alpha: 0,
        duration: 2000,
        ease: 'Power2',
        onComplete: () => { if (this.boss) this.boss.destroy(); },
      });

      this.showStageTransitionArrow();
      this.cinematicMode = false;
      return;
    }

    // Full boss (stage 3): spin and fly off, then open cage
    this.tweens.add({
      targets: this.boss,
      alpha: 0,
      scale: 0.1,
      angle: 720,
      y: this.boss.y - 200,
      duration: 800,
      ease: 'Power2',
      onComplete: () => {
        if (this.boss) this.boss.destroy();

        // Cage open + Skye release fires AFTER exit animation completes
        if (this.levelData.hasSkye && this.skye) {
          this.startSkyeRescue();
        }
      },
    });
  }

  startSkyeRescue() {
    // Don't open the cage yet — wait for Chase to be near enough to see it.
    // Show the bouncing arrow immediately to guide the player.
    this._awaitingCageOpen = true;
    this._cageOpened = false;

    // Bouncing arrow pointing toward Skye
    const arrowX = this.skye.x - 60;
    const arrowY = this.skye.y - 50;
    this.skyeArrow = this.add.image(arrowX, arrowY, 'stage-arrow').setDepth(20);
    this.tweens.add({
      targets: this.skyeArrow,
      y: arrowY - 15,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Overlap zone at Skye — player must walk there to trigger celebration
    this.skyeZone = this.add.rectangle(this.skye.x, this.skye.y, 80, 80, 0x00ff00, 0);
    this.physics.add.existing(this.skyeZone, true);
    this.physics.add.overlap(this.player, this.skyeZone, this.onReachSkye, null, this);
  }

  /**
   * Called from update() when Chase is close enough to the cage.
   * Opens the cage with a slow, dramatic animation so the player sees Skye was caged.
   */
  openCage() {
    if (this._cageOpened || !this.cageGraphics) return;
    this._cageOpened = true;
    this._awaitingCageOpen = false;

    // Cage rattles/shakes for a beat before flying open
    this.tweens.add({
      targets: this.cageGraphics,
      x: { value: 3, duration: 80, yoyo: true, repeat: 5 },
      onComplete: () => {
        // Cage flies upward and fades out slowly
        this.tweens.add({
          targets: this.cageGraphics,
          y: -200,
          alpha: 0,
          scaleX: 0.3,
          scaleY: 0.3,
          duration: 1800,
          ease: 'Sine.easeIn',
        });
      },
    });
  }

  onReachSkye() {
    if (this.skyeReached) return;
    this.skyeReached = true;
    this.isTransitioning = true;

    // Force-open cage if it hasn't opened yet (failsafe)
    if (!this._cageOpened && this.cageGraphics) {
      this._cageOpened = true;
      this._awaitingCageOpen = false;
      this.tweens.add({
        targets: this.cageGraphics,
        y: -200, alpha: 0, scaleX: 0.3, scaleY: 0.3,
        duration: 800, ease: 'Sine.easeIn',
      });
    }

    if (this.skyeArrow) this.skyeArrow.destroy();

    this.player.setVelocityX(0);

    // Start victory fanfare when Chase and Skye start celebrating
    const audioManager = this.registry.get('audioManager');
    if (audioManager) {
      audioManager.playMusic('theme-victory', { volume: 0.5, loop: false, fadeIn: 300, fadeOut: 500 });
    }

    // Chase and Skye bounce together
    this.tweens.add({
      targets: [this.player, this.skye],
      y: '-=25',
      duration: 350,
      yoyo: true,
      repeat: 5,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          const state = this.registry.get('state');
          state.accumulateTime(this._sceneElapsed);
          const sceneData = {
            time: state.getTotalSeconds(),
            treats: state.treatsCollected,
            kitties: state.kittiesCaptured,
          };
          this.cleanup();
          this.scene.stop('UIScene');
          this.scene.start('VictoryScene', sceneData);
        });
      },
    });
  }

  // --- FAIL-SAFES ---

  // Returns true if boss has disappeared (destroyed, inactive, or off-screen)
  isBossGone() {
    if (!this.boss || !this.boss.active) return true;
    const cam = this.cameras.main;
    const bossScreenX = this.boss.x - cam.scrollX;
    return bossScreenX < -200 || bossScreenX > GAME_WIDTH + 200;
  }

  // Safety net: if boss vanished without properly triggering defeat, force completion
  bossGoneFailsafe() {
    if (this.bossState === 'defeated') return;
    this.bossState = 'defeated';
    this.clearBossTimers();
    this.clearVulnerabilityVisuals();
    this.cancelAllTimers();
    this.cinematicMode = false;

    // Play defeat SFX even in failsafe path
    const sfx = this.registry.get('sfx');
    if (sfx) sfx.play('sfx-boss-defeat');

    if (this.bossCollider) {
      this.physics.world.removeCollider(this.bossCollider);
      this.bossCollider = null;
    }
    if (this.bossBarrier) this.bossBarrier.destroy();

    if (this.levelData.miniBoss) {
      this.showStageTransitionArrow();
    } else if (this.levelData.hasSkye && this.skye && !this.skyeZone) {
      this.startSkyeRescue();
    }
  }

  showStageTransitionArrow() {
    const arrowX = this.levelData.exitX - 50;
    const arrowY = GAME_HEIGHT - 100;
    const arrow = this.add.image(arrowX, arrowY, 'stage-arrow').setDepth(20);

    this.tweens.add({
      targets: arrow,
      y: arrowY - 15,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // --- NET ATTACK ---

  doNetAttack() {
    if (this.netOnCooldown) return;

    const sfx = this.registry.get('sfx');
    if (sfx) sfx.playRandom(['sfx-bark', 'sfx-net-call']);

    this.netOnCooldown = true;

    const dir = this.player.flipX ? -1 : 1;
    const startX = this.player.x + dir * 20;
    const startY = this.player.y;

    const net = this.nets.get(startX, startY, 'net-projectile');
    if (!net) return; // pool exhausted

    net.setActive(true).setVisible(true);
    net.body.enable = true;
    net.body.reset(startX, startY);
    net.body.setAllowGravity(false);
    net.setVelocityX(dir * NET_SPEED);
    net.setFlipX(dir < 0);
    net.setDepth(15);
    net.originX = startX;

    const cooldownTimer = this.time.delayedCall(NET_COOLDOWN, () => {
      this.netOnCooldown = false;
    });
    this.pendingTimers.push(cooldownTimer);
  }

  // --- ENEMY INTERACTIONS ---

  defeatEnemy(enemy) {
    if (!enemy || !enemy.active) return;
    enemy.active = false;
    enemy.body.enable = false;
    this.enemies.remove(enemy, false, false);

    const sfx = this.registry.get('sfx');
    if (sfx) sfx.play('sfx-kitty-defeat');

    // Update kitty counter
    const state = this.registry.get('state');
    state.captureKitty();
    this.game.events.emit('kitty-captured', state.kittiesCaptured);

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

    // Robust stomp detection: compare vertical vs horizontal overlap
    const overlapFromTop = player.body.bottom - enemy.body.top;
    const overlapFromLeft = player.body.right - enemy.body.left;
    const overlapFromRight = enemy.body.right - player.body.left;
    const horizontalOverlap = Math.min(overlapFromLeft, overlapFromRight);

    const isStomping = player.body.velocity.y > 0 &&
      overlapFromTop > 0 &&
      overlapFromTop < enemy.body.halfHeight &&
      overlapFromTop < horizontalOverlap;

    if (isStomping) {
      this.defeatEnemy(enemy);
      player.setVelocityY(BOUNCE_VELOCITY);
      this.jumpsRemaining = 2;
    } else {
      this.hitEnemy(player, enemy);
    }
  }

  hitEnemy(player, enemy) {
    if (this.isInvincible || this.cinematicMode || this.isTransitioning) return;

    const state = this.registry.get('state');
    const sfx = this.registry.get('sfx');
    const remaining = state.takeDamage();
    this.game.events.emit('health-changed', remaining);
    if (sfx) sfx.play('hurt');

    this.isInvincible = true;

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
      onComplete: () => { if (player.active) player.setAlpha(1); },
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
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    this.cancelAllTimers();

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
    if (this.exitReached || this.isTransitioning) return;

    // Block exit if boss is alive
    if (this.levelData.hasBoss && this.bossState !== 'defeated') return;

    // Block exit until Skye rescue sequence is complete
    if (this.levelData.hasSkye && !this.skyeReached) return;

    this.exitReached = true;
    this.isTransitioning = true;

    const state = this.registry.get('state');
    const nextLevel = this.levelIndex + 1;

    if (nextLevel >= LEVELS.length) {
      this.cameras.main.fadeOut(500);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        state.accumulateTime(this._sceneElapsed);
        const sceneData = {
          time: state.getTotalSeconds(),
          treats: state.treatsCollected,
          kitties: state.kittiesCaptured,
        };
        this.cleanup();
        this.scene.stop('UIScene');
        this.scene.start('VictoryScene', sceneData);
      });
      return;
    }

    // Accumulate time before transitioning to next level
    state.accumulateTime(this._sceneElapsed);
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

  update(time, delta) {
    if (!this.player || !this.player.body) return;

    // Accumulate elapsed time for timer
    if (!this.isTransitioning && !this.cinematicMode) {
      this._sceneElapsed += delta;
    }

    const player = this.player;
    const onGround = player.body.onFloor();

    // Reset jumps when landing
    if (onGround && !this.wasOnGround) {
      this.jumpsRemaining = 2;
    }
    this.wasOnGround = onGround;

    // --- Input (allowed even in cinematicMode so player can walk to Skye) ---
    let moveX = 0;
    let wantsJump = false;
    let wantsNet = false;

    if (!this.isTransitioning) {
      // Keyboard
      if (this.cursors.left.isDown) moveX -= 1;
      if (this.cursors.right.isDown) moveX += 1;
      if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        wantsJump = true;
      }
      if (Phaser.Input.Keyboard.JustDown(this.netKey)) {
        wantsNet = true;
      }

      // Touch
      if (this.touchIntent.left) moveX -= 1;
      if (this.touchIntent.right) moveX += 1;
      if (this.touchIntent.jump) {
        const now = this.time.now;
        if (now - (this._lastJumpTime || 0) > 150) {
          wantsJump = true;
          this._lastJumpTime = now;
        }
        this.touchIntent.jump = false;
      }
      if (this.touchIntent.net) {
        const now = this.time.now;
        if (now - (this._lastNetTime || 0) > 150) {
          wantsNet = true;
          this._lastNetTime = now;
        }
        this.touchIntent.net = false;
      }
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
        player.setVelocityY(JUMP_VELOCITY);
        if (sfx) sfx.play('jump');
      } else {
        player.setVelocityY(DOUBLE_JUMP_VELOCITY);
        if (sfx) sfx.play('double-jump');
      }
      this.jumpsRemaining--;
    }

    // Variable-height jump — dampen when jump input is released mid-air
    const jumpHeld = !this.cursors.up.isUp || !this.spaceKey.isUp || this._jumpHeld;
    if (!jumpHeld && player.body.velocity.y < 0) {
      player.setVelocityY(player.body.velocity.y * 0.85);
    }

    // Net attack
    if (wantsNet) {
      this.doNetAttack();
    }

    // Net distance check — deactivate nets that have traveled max distance
    this.nets.getChildren().forEach((net) => {
      if (!net.active) return;
      if (Math.abs(net.x - net.originX) >= NET_MAX_DISTANCE) {
        net.setActive(false).setVisible(false);
        net.body.enable = false;
      }
    });

    // Enemy patrol behavior with velocity recovery
    this.enemies.getChildren().forEach((kitty) => {
      if (!kitty.active || !kitty.body || !kitty.body.enable) return;

      if (kitty.x <= kitty.patrolLeft && kitty.body.velocity.x <= 0) {
        kitty.setVelocityX(kitty.speed);
        kitty.setFlipX(true);   // sprite faces left by default, flip to face right
      } else if (kitty.x >= kitty.patrolRight && kitty.body.velocity.x >= 0) {
        kitty.setVelocityX(-kitty.speed);
        kitty.setFlipX(false);  // moving left = default orientation
      }

      // Safety: recover from zeroed velocity
      if (kitty.body.velocity.x === 0) {
        const center = (kitty.patrolLeft + kitty.patrolRight) / 2;
        const dir = kitty.x < center ? 1 : -1;
        kitty.setVelocityX(dir * kitty.speed);
        kitty.setFlipX(dir > 0);  // flip when moving right
      }
    });

    // Boss Y-tracking — smooth delta-time-corrected lerp in update
    if (this.boss && this.boss.active &&
        (this.bossState === 'approaching' || this.bossState === 'vulnerable')) {
      const targetY = this.playerGroundY - 32;
      const lerpFactor = 1 - Math.pow(0.85, (delta || 16.67) / 16.67);
      this.boss.y = Phaser.Math.Linear(this.boss.y, targetY, lerpFactor);
    }

    // Cage proximity check: open cage when Chase is on-screen near it
    if (this._awaitingCageOpen && this.skye && this.player) {
      const dist = Math.abs(this.player.x - this.skye.x);
      const cam = this.cameras.main;
      const skyeScreenX = this.skye.x - cam.scrollX;
      const isOnScreen = skyeScreenX > -50 && skyeScreenX < GAME_WIDTH + 50;
      if (dist < 300 && isOnScreen) {
        this.openCage();
      }
    }

    // Fail-safe: if boss vanished, ensure game is still completable
    if (this.bossActive && this.bossState !== 'defeated' && !this.isTransitioning) {
      if (this.isBossGone()) {
        if (!this._bossGoneTime) {
          this._bossGoneTime = time;
        }
        const elapsed = time - this._bossGoneTime;
        if (this.levelData.miniBoss) {
          // Stages 1-2: immediate failsafe
          this.bossGoneFailsafe();
        } else if (elapsed >= 3000) {
          // Stage 3: 3-second grace period before failsafe
          this.bossGoneFailsafe();
        }
      } else {
        this._bossGoneTime = null;
      }
    }

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
    this.tweens.killAll();
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

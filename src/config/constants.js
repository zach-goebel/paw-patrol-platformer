// Player tuning
export const PLAYER_SPEED = 120;
export const JUMP_VELOCITY = -350;
export const DOUBLE_JUMP_VELOCITY = -300;
export const BOUNCE_VELOCITY = -200;
export const INVINCIBILITY_MS = 2500;
export const MAX_HEALTH = 3;
export const PAW_ATTACK_DURATION = 200;
export const PAW_ATTACK_COOLDOWN = 500;
export const PAW_ATTACK_RANGE = 40;

// Physics
export const GRAVITY = 800;
export const TILE_SIZE = 32;

// Game
export const BOSS_CATCH_WINDOW = 3000;
export const BOSS_CATCHES_TO_WIN = 3;

// Canvas
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 480;

// Asset keys
export const ASSETS = {
  PLAYER: 'player',
  KITTY: 'kitty',
  TREAT: 'treat',
  BOSS: 'boss',
  SKYE: 'skye',
  TILESET: 'tileset',
  PAW_BUTTON: 'paw-button',
  PLAY_ICON: 'play-icon',
  ARROW_LEFT: 'arrow-left',
  ARROW_RIGHT: 'arrow-right',
  JUMP_BUTTON: 'jump-button',
  MUSIC_ADVENTURE: 'music-adventure',
  MUSIC_FOGGY: 'music-foggy',
  MUSIC_BOSS: 'music-boss',
  SFX_JUMP: 'sfx-jump',
  SFX_COLLECT: 'sfx-collect',
  SFX_BOUNCE: 'sfx-bounce',
  SFX_CATCH: 'sfx-catch',
  SFX_VICTORY: 'sfx-victory',
};

// Colors
export const COLORS = {
  SKY_BLUE: 0x87ceeb,
  FOGGY_GREY: 0x6b7b8d,
  LAIR_DARK: 0x2d1b4e,
  GRASS_GREEN: 0x4caf50,
  PLATFORM_BROWN: 0x8d6e63,
  CHASE_BLUE: 0x2e86c1,
  KITTY_PURPLE: 0x9b59b6,
  TREAT_GOLD: 0xffd700,
  HUMDINGER_PURPLE: 0x6c3483,
  PAW_RED: 0xe31e24,
  BADGE_YELLOW: 0xffd700,
  UI_DARK: 0x000000,
};

// Level data
export const LEVELS = [
  {
    key: 'adventure-bay',
    name: 'Adventure Bay',
    background: COLORS.SKY_BLUE,
    groundColor: COLORS.GRASS_GREEN,
    platformColor: COLORS.PLATFORM_BROWN,
    music: ASSETS.MUSIC_ADVENTURE,
    platforms: [
      { x: 0, y: 448, w: 3200, h: 32 },
      { x: 300, y: 350, w: 160, h: 32 },
      { x: 550, y: 300, w: 128, h: 32 },
      { x: 800, y: 350, w: 192, h: 32 },
      { x: 1100, y: 280, w: 160, h: 32 },
      { x: 1400, y: 350, w: 128, h: 32 },
      { x: 1650, y: 300, w: 192, h: 32 },
      { x: 1950, y: 350, w: 160, h: 32 },
      { x: 2200, y: 280, w: 128, h: 32 },
      { x: 2500, y: 350, w: 192, h: 32 },
    ],
    enemies: [
      { x: 600, y: 416, patrolLeft: 500, patrolRight: 700 },
      { x: 1200, y: 416, patrolLeft: 1100, patrolRight: 1350 },
      { x: 1800, y: 416, patrolLeft: 1700, patrolRight: 1950 },
      { x: 2400, y: 416, patrolLeft: 2300, patrolRight: 2550 },
    ],
    collectibles: [
      { x: 200, y: 410 },
      { x: 350, y: 318 },
      { x: 400, y: 318 },
      { x: 600, y: 268 },
      { x: 850, y: 318 },
      { x: 900, y: 318 },
      { x: 1150, y: 248 },
      { x: 1450, y: 318 },
      { x: 1700, y: 268 },
      { x: 1750, y: 268 },
      { x: 2000, y: 318 },
      { x: 2250, y: 248 },
      { x: 2550, y: 318 },
      { x: 2600, y: 318 },
      { x: 2800, y: 410 },
    ],
    exitX: 3100,
    hasBoss: true,
    bossX: 2900,
    bossHP: 2,
    bossSpeed: 60,
    hasSkye: false,
  },
  {
    key: 'foggy-bottom',
    name: 'Foggy Bottom',
    background: COLORS.FOGGY_GREY,
    groundColor: 0x5d6d7e,
    platformColor: 0x7f8c8d,
    music: ASSETS.MUSIC_FOGGY,
    platforms: [
      { x: 0, y: 448, w: 3200, h: 32 },
      { x: 250, y: 360, w: 128, h: 32 },
      { x: 450, y: 300, w: 160, h: 32 },
      { x: 700, y: 360, w: 128, h: 32 },
      { x: 900, y: 280, w: 192, h: 32 },
      { x: 1200, y: 340, w: 128, h: 32 },
      { x: 1450, y: 280, w: 160, h: 32 },
      { x: 1700, y: 340, w: 128, h: 32 },
      { x: 1950, y: 260, w: 192, h: 32 },
      { x: 2200, y: 340, w: 160, h: 32 },
      { x: 2500, y: 280, w: 128, h: 32 },
    ],
    enemies: [
      { x: 400, y: 416, patrolLeft: 300, patrolRight: 550 },
      { x: 800, y: 416, patrolLeft: 700, patrolRight: 950 },
      { x: 1300, y: 416, patrolLeft: 1150, patrolRight: 1400 },
      { x: 1600, y: 416, patrolLeft: 1500, patrolRight: 1750 },
      { x: 2100, y: 416, patrolLeft: 2000, patrolRight: 2250 },
      { x: 2600, y: 416, patrolLeft: 2450, patrolRight: 2700 },
    ],
    collectibles: [
      { x: 150, y: 410 },
      { x: 300, y: 328 },
      { x: 500, y: 268 },
      { x: 750, y: 328 },
      { x: 950, y: 248 },
      { x: 1000, y: 248 },
      { x: 1250, y: 308 },
      { x: 1500, y: 248 },
      { x: 1550, y: 248 },
      { x: 1750, y: 308 },
      { x: 2000, y: 228 },
      { x: 2250, y: 308 },
      { x: 2550, y: 248 },
      { x: 2700, y: 410 },
      { x: 2800, y: 410 },
    ],
    exitX: 3100,
    hasBoss: true,
    bossX: 2900,
    bossHP: 3,
    bossSpeed: 80,
    hasSkye: false,
  },
  {
    key: 'humdinger-lair',
    name: "Humdinger's Lair",
    background: COLORS.LAIR_DARK,
    groundColor: 0x4a235a,
    platformColor: 0x6c3483,
    music: ASSETS.MUSIC_BOSS,
    platforms: [
      { x: 0, y: 448, w: 2400, h: 32 },
      { x: 200, y: 360, w: 160, h: 32 },
      { x: 450, y: 300, w: 128, h: 32 },
      { x: 700, y: 360, w: 160, h: 32 },
      { x: 950, y: 280, w: 128, h: 32 },
      { x: 1200, y: 340, w: 192, h: 32 },
      { x: 1500, y: 300, w: 128, h: 32 },
      { x: 1750, y: 360, w: 160, h: 32 },
    ],
    enemies: [
      { x: 350, y: 416, patrolLeft: 250, patrolRight: 500 },
      { x: 750, y: 416, patrolLeft: 650, patrolRight: 900 },
      { x: 1100, y: 416, patrolLeft: 1000, patrolRight: 1250 },
      { x: 1600, y: 416, patrolLeft: 1450, patrolRight: 1700 },
    ],
    collectibles: [
      { x: 150, y: 410 },
      { x: 250, y: 328 },
      { x: 500, y: 268 },
      { x: 750, y: 328 },
      { x: 1000, y: 248 },
      { x: 1250, y: 308 },
      { x: 1550, y: 268 },
      { x: 1800, y: 328 },
    ],
    exitX: 2200,
    hasBoss: true,
    bossX: 2000,
    bossHP: 3,
    bossSpeed: 100,
    hasSkye: true,
  },
];

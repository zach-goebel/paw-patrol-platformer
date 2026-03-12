import { MAX_HEALTH } from './constants.js';

const INITIAL = {
  currentLevel: 0,
  score: 0,
  treatsCollected: 0,
  kittiesCaptured: 0,
  health: MAX_HEALTH,
  totalTimeMs: 0,
};

export default class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    Object.assign(this, structuredClone(INITIAL));
  }

  resetHealth() {
    // Per-level reset. Does NOT reset cross-level progress (treats, kitties).
    this.health = MAX_HEALTH;
  }

  captureKitty() {
    this.kittiesCaptured++;
  }

  addScore(points) {
    this.score += points;
    this.treatsCollected++;
  }

  takeDamage() {
    this.health = Math.max(0, this.health - 1);
    return this.health;
  }

  nextLevel() {
    this.currentLevel++;
  }

  accumulateTime(elapsedMs) {
    this.totalTimeMs += elapsedMs;
  }

  getTotalSeconds() {
    return Math.floor(this.totalTimeMs / 1000);
  }
}

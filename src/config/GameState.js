import { MAX_HEALTH } from './constants.js';

const INITIAL = {
  currentLevel: 0,
  score: 0,
  treatsCollected: 0,
  health: MAX_HEALTH,
};

export default class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    Object.assign(this, structuredClone(INITIAL));
  }

  resetHealth() {
    this.health = MAX_HEALTH;
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
}

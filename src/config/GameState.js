const INITIAL = {
  currentLevel: 0,
  score: 0,
  treatsCollected: 0,
};

export default class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    Object.assign(this, structuredClone(INITIAL));
  }

  addScore(points) {
    this.score += points;
    this.treatsCollected++;
  }

  nextLevel() {
    this.currentLevel++;
  }
}

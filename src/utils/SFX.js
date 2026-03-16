export default class SFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.muted = false;
    this.fileSounds = {};  // name -> AudioBuffer
  }

  init(audioContext) {
    try {
      this.ctx = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      this.enabled = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Per-sound volume overrides (default is 0.6)
  static FILE_VOLUMES = {
    'sfx-kitty-defeat': 0.45,   // ~10% quieter than default
    'sfx-net-call': 0.52,       // ~5% quieter than default
    'sfx-boss-defeat': 0.9,     // Loud but safe for mobile audio pipelines
  };

  /**
   * Register a file-based sound effect from a preloaded Phaser audio cache.
   * @param {string} name - SFX name to use with play()
   * @param {AudioBuffer} buffer - Decoded audio buffer
   */
  addFileSound(name, buffer) {
    this.fileSounds[name] = buffer;
  }

  /**
   * Play a random sound from the given list of names.
   * @param {string[]} names - Array of SFX names
   */
  playRandom(names) {
    if (!names || names.length === 0) return;
    const name = names[Math.floor(Math.random() * names.length)];
    this.play(name);
  }

  play(name) {
    if (!this.enabled || !this.ctx || this.muted) return;

    // If context is suspended, resume it first. For file-based sounds,
    // we must wait for resume to complete before starting the buffer source.
    if (this.ctx.state === 'suspended') {
      const resumePromise = this.ctx.resume();
      if (resumePromise && this.fileSounds[name]) {
        resumePromise.then(() => this._playBuffer(this.fileSounds[name], name)).catch(() => {});
        return;
      }
    }

    // Check for file-based sound first
    if (this.fileSounds[name]) {
      this._playBuffer(this.fileSounds[name], name);
      return;
    }

    const t = this.ctx.currentTime;
    switch (name) {
      case 'jump': this._tone(t, 400, 600, 0.08, 0.15); break;
      case 'double-jump': this._tone(t, 500, 800, 0.08, 0.12); break;
      case 'collect': this._chime(t); break;
      case 'stomp': this._boing(t); break;
      case 'net': this._tone(t, 800, 400, 0.1, 0.12); break;
      case 'hurt': this._tone(t, 400, 200, 0.12, 0.2); break;
      case 'boss-hit': this._tone(t, 200, 80, 0.1, 0.25); break;
      case 'tick': this._tone(t, 600, 600, 0.03, 0.08); break;
      case 'victory': this._arpeggio(t); break;
      default: break;
    }
  }

  _playBuffer(buffer, name) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    const vol = SFX.FILE_VOLUMES[name] ?? 0.6;
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    source.connect(gain).connect(this.ctx.destination);
    source.start(0);
  }

  _tone(t, startFreq, endFreq, dur, vol = 0.15) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.linearRampToValueAtTime(endFreq, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  _chime(t) {
    this._tone(t, 800, 800, 0.06, 0.12);
    this._tone(t + 0.07, 1200, 1200, 0.08, 0.12);
  }

  _boing(t) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.05);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.15);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  _noise(t, dur) {
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    source.connect(gain).connect(this.ctx.destination);
    source.start(t);
  }

  _arpeggio(t) {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      this._tone(t + i * 0.12, freq, freq, 0.15, 0.12);
    });
  }
}

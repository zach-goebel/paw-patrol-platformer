/**
 * Centralized music manager using HTML5 Audio for all platforms.
 * HTML5 Audio avoids Web Audio decodeAudioData issues with certain MP3 encodings
 * and bypasses the iOS silent switch (activates "playback" audio session).
 */

const MUSIC_TRACKS = {
  'theme-title': 'assets/audio/theme-title.mp3',
  'theme-story': 'assets/audio/theme-story.mp3',
  'theme-gameplay': 'assets/audio/theme.mp3',
  'theme-boss': 'assets/audio/theme-boss.mp3',
  'theme-victory': 'assets/audio/theme-victory.mp3',
};

export default class AudioManager {
  constructor(game) {
    this.game = game;
    this.currentAudio = null;
    this.currentKey = null;
    this._fadeTimer = null;
  }

  /**
   * Play a music track with crossfade from current track.
   */
  playMusic(key, { volume = 0.4, loop = true, fadeIn = 500, fadeOut = 500 } = {}) {
    if (this.currentKey === key) return;

    const path = MUSIC_TRACKS[key];
    if (!path) {
      console.warn(`AudioManager: unknown track "${key}"`);
      return;
    }

    // Fade out current
    if (this.currentAudio) {
      this._fadeOutAudio(this.currentAudio, fadeOut);
    }

    this.currentKey = key;

    const audio = new Audio(path);
    audio.loop = loop;
    audio.volume = 0;
    this.currentAudio = audio;

    audio.play().catch(() => {});
    this._fadeInAudio(audio, volume, fadeIn);
  }

  /**
   * Stop all music with optional fade out.
   */
  stopMusic(fadeOut = 500) {
    if (this.currentAudio) {
      this._fadeOutAudio(this.currentAudio, fadeOut);
    }
    // Clear state immediately so playMusic() won't skip the next call
    this.currentAudio = null;
    this.currentKey = null;
  }

  _fadeInAudio(audio, targetVolume, duration) {
    const steps = 20;
    const interval = duration / steps;
    const increment = targetVolume / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      try {
        audio.volume = Math.min(targetVolume, increment * step);
      } catch { /* audio may be garbage collected */ }
      if (step >= steps) {
        clearInterval(timer);
        try { audio.volume = targetVolume; } catch {}
      }
    }, interval);
  }

  _fadeOutAudio(audio, duration) {
    const startVolume = audio.volume;
    if (startVolume === 0) {
      audio.pause();
      return;
    }

    const steps = 20;
    const interval = duration / steps;
    const decrement = startVolume / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      try {
        audio.volume = Math.max(0, startVolume - decrement * step);
      } catch { /* audio may be garbage collected */ }
      if (step >= steps) {
        clearInterval(timer);
        try {
          audio.pause();
          audio.volume = 0;
        } catch {}
      }
    }, interval);
  }

  /**
   * Resume audio context (call on user gesture for iOS).
   */
  resume() {
    const ctx = this.game.sound && this.game.sound.context;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  }
}

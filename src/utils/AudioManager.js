/**
 * Centralized music manager with crossfade transitions.
 * Handles mobile (HTML5 Audio) vs desktop (Phaser Web Audio) playback.
 */
export default class AudioManager {
  constructor(game) {
    this.game = game;
    this.isMobile = game.registry.get('isTouchDevice');
    this.currentTrack = null;
    this.currentKey = null;
    this.tracks = {};        // Phaser sound objects (desktop)
    this.htmlTracks = {};    // HTML5 Audio elements (mobile)
    this._fadeTween = null;
  }

  /**
   * Register a track for later playback.
   * On desktop, creates a Phaser sound object.
   * On mobile, creates an HTML5 Audio element.
   */
  addTrack(key, filePath) {
    if (this.isMobile) {
      const audio = new Audio(filePath);
      audio.preload = 'auto';
      audio.loop = true;
      audio.volume = 0;
      this.htmlTracks[key] = audio;
    } else {
      // Phaser sound objects are created from preloaded audio cache
      if (this.game.sound.get(key)) return;
      const sound = this.game.sound.add(key, { loop: true, volume: 0 });
      this.tracks[key] = sound;
    }
  }

  /**
   * Play a music track with optional crossfade from current track.
   * @param {string} key - Track key (must be registered via addTrack or preloaded)
   * @param {object} options
   * @param {number} options.volume - Target volume (default 0.4)
   * @param {boolean} options.loop - Loop the track (default true)
   * @param {number} options.fadeIn - Fade in duration in ms (default 500)
   * @param {number} options.fadeOut - Fade out duration for current track in ms (default 500)
   */
  playMusic(key, { volume = 0.4, loop = true, fadeIn = 500, fadeOut = 500 } = {}) {
    // Already playing this track
    if (this.currentKey === key) return;

    // Fade out current track
    if (this.currentTrack) {
      this._fadeOut(this.currentTrack, this.currentKey, fadeOut);
    }

    this.currentKey = key;

    if (this.isMobile) {
      this._playMobile(key, volume, loop, fadeIn);
    } else {
      this._playDesktop(key, volume, loop, fadeIn);
    }
  }

  /**
   * Stop all music with optional fade out.
   */
  stopMusic(fadeOut = 500) {
    if (this.currentTrack) {
      this._fadeOut(this.currentTrack, this.currentKey, fadeOut);
      this.currentTrack = null;
      this.currentKey = null;
    }
  }

  // --- Desktop (Phaser Web Audio) ---

  _playDesktop(key, volume, loop, fadeIn) {
    let sound = this.tracks[key];
    if (!sound) {
      // Try creating from Phaser cache
      try {
        sound = this.game.sound.add(key, { loop, volume: 0 });
        this.tracks[key] = sound;
      } catch {
        console.warn(`AudioManager: track "${key}" not found in cache`);
        return;
      }
    }

    sound.setLoop(loop);
    sound.setVolume(0);
    sound.play();
    this.currentTrack = sound;

    // Fade in
    if (this._fadeTween) this._fadeTween.destroy();
    this._fadeTween = this.game.tweens.add({
      targets: sound,
      volume,
      duration: fadeIn,
      ease: 'Linear',
    });
  }

  _fadeOut(track, key, duration) {
    if (this.isMobile) {
      this._fadeOutMobile(track, key, duration);
    } else {
      this._fadeOutDesktop(track, duration);
    }
  }

  _fadeOutDesktop(sound, duration) {
    if (!sound || !sound.isPlaying) return;
    this.game.tweens.add({
      targets: sound,
      volume: 0,
      duration,
      ease: 'Linear',
      onComplete: () => {
        sound.stop();
      },
    });
  }

  // --- Mobile (HTML5 Audio) ---

  _playMobile(key, volume, loop, fadeIn) {
    let audio = this.htmlTracks[key];
    if (!audio) {
      console.warn(`AudioManager: HTML5 track "${key}" not registered`);
      return;
    }

    audio.loop = loop;
    audio.volume = 0;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    this.currentTrack = audio;

    // Fade in using interval (no tweens for HTML5 Audio)
    this._fadeInMobile(audio, volume, fadeIn);
  }

  _fadeInMobile(audio, targetVolume, duration) {
    const steps = 20;
    const interval = duration / steps;
    const increment = targetVolume / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      audio.volume = Math.min(targetVolume, increment * step);
      if (step >= steps) {
        clearInterval(timer);
        audio.volume = targetVolume;
      }
    }, interval);
  }

  _fadeOutMobile(audio, key, duration) {
    if (!audio || audio.paused) return;
    const startVolume = audio.volume;
    const steps = 20;
    const interval = duration / steps;
    const decrement = startVolume / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      audio.volume = Math.max(0, startVolume - decrement * step);
      if (step >= steps) {
        clearInterval(timer);
        audio.pause();
        audio.volume = 0;
      }
    }, interval);
  }

  /**
   * Resume audio context (call on user gesture for iOS).
   */
  resume() {
    if (!this.isMobile) {
      const ctx = this.game.sound && this.game.sound.context;
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }
    }
  }
}

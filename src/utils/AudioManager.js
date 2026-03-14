/**
 * Centralized music manager using HTML5 Audio for all platforms.
 * HTML5 Audio avoids Web Audio decodeAudioData issues with certain MP3 encodings
 * and bypasses the iOS silent switch (activates "playback" audio session).
 *
 * Mobile fix: Audio elements are pre-created and unlocked during the first user
 * gesture (via unlock()). This allows later programmatic playMusic() calls
 * (e.g. boss fight transitions) to succeed without a direct user gesture.
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
    this._pool = {};       // key -> Audio element (pre-created)
    this._unlocked = false;
  }

  /**
   * Pre-create and unlock all Audio elements. Must be called during a user
   * gesture (e.g. tap on splash screen) so that each element's play()/pause()
   * registers as gesture-initiated on mobile browsers.
   */
  unlock() {
    if (this._unlocked) return;

    for (const [key, path] of Object.entries(MUSIC_TRACKS)) {
      // Skip if already in pool (shouldn't happen, but defensive)
      if (this._pool[key]) continue;

      const audio = new Audio(path);
      audio.preload = 'auto';
      audio.load();

      // Unlock the element by playing and immediately pausing.
      // On iOS Safari, this registers the element as user-gesture-activated,
      // allowing future programmatic .play() calls to succeed.
      const p = audio.play();
      if (p) {
        p.then(() => {
          audio.pause();
          audio.currentTime = 0;
        }).catch(() => {
          // play() was blocked — element is still in pool and will be
          // retried on next playMusic() call (which may also be in a gesture)
        });
      }

      this._pool[key] = audio;
    }

    this._unlocked = true;
  }

  /**
   * Play a music track with crossfade from current track.
   * onStarted callback fires if playback begins (not blocked by autoplay).
   */
  playMusic(key, { volume = 0.4, loop = true, fadeIn = 500, fadeOut = 500, onStarted } = {}) {
    if (this.currentKey === key) {
      if (onStarted) onStarted();
      return;
    }

    const path = MUSIC_TRACKS[key];
    if (!path) {
      console.warn(`AudioManager: unknown track "${key}"`);
      return;
    }

    // Fade out current
    if (this.currentAudio) {
      this._fadeOutAudio(this.currentAudio, fadeOut);
    }

    // Reuse pre-created pool element if available, otherwise create new
    let audio = this._pool[key];
    if (audio) {
      // Reset for reuse
      audio.loop = loop;
      audio.volume = 0;
      audio.currentTime = 0;
    } else {
      // Fallback: create on demand (may fail on mobile without gesture)
      audio = new Audio(path);
      audio.loop = loop;
      audio.volume = 0;
      this._pool[key] = audio;
    }

    this.currentKey = key;
    this.currentAudio = audio;

    const playPromise = audio.play();
    if (playPromise) {
      playPromise.then(() => {
        // Playback started successfully
        this._fadeInAudio(audio, volume, fadeIn);
        if (onStarted) onStarted();
      }).catch(() => {
        // Autoplay blocked — but DON'T null out state.
        // Keep currentKey/currentAudio so the same-key guard works
        // and the next user gesture can retry via resume() or playMusic().
        // Only clean up if nothing else has taken over.
        if (this.currentAudio === audio) {
          this.currentAudio = null;
          this.currentKey = null;
        }
      });
    } else {
      // No promise (old browser) — assume success
      this._fadeInAudio(audio, volume, fadeIn);
      if (onStarted) onStarted();
    }
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
    if (duration <= 0) {
      try { audio.volume = targetVolume; } catch {}
      return;
    }

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
    // Immediate stop for duration <= 0
    if (duration <= 0) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 0;
      } catch {}
      return;
    }

    const startVolume = audio.volume;
    if (startVolume === 0) {
      try { audio.pause(); } catch {}
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

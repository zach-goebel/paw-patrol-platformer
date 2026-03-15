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
    this._muted = false;
    this._muteVolume = 0;  // volume before muting
  }

  /**
   * Pre-create and unlock all Audio elements. Must be called during a user
   * gesture (e.g. tap on splash screen) so that each element's play()/pause()
   * registers as gesture-initiated on mobile browsers.
   */
  unlock() {
    if (this._unlocked) return;

    for (const [key, path] of Object.entries(MUSIC_TRACKS)) {
      if (this._pool[key]) continue;

      const audio = new Audio(path);
      audio.preload = 'auto';
      audio.volume = 0;
      audio.muted = true;  // Belt-and-suspenders: mobile ignores volume=0 briefly
      audio.load();

      // Unlock the element by playing and immediately pausing.
      // On iOS Safari, this registers the element as user-gesture-activated,
      // allowing future programmatic .play() calls to succeed.
      const p = audio.play();
      if (p) {
        p.then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }).catch(() => { audio.muted = false; });
      } else {
        audio.muted = false;
      }

      this._pool[key] = audio;
    }

    this._unlocked = true;

    // Listen for iOS audio interruptions (alarms, phone calls, etc.)
    // When the page regains focus, resume whatever track should be playing.
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        this._recoverFromInterruption();
      }
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    // iOS fires 'focus' on return from interruption even without visibility change
    this._onFocus = () => { this._recoverFromInterruption(); };
    window.addEventListener('focus', this._onFocus);
  }

  /**
   * After an iOS interruption (alarm, phone call), the Audio elements get
   * paused by the OS. Detect this and restart the current track.
   */
  _recoverFromInterruption() {
    // Resume Web Audio context for SFX
    const ctx = this.game.sound && this.game.sound.context;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }

    // If we have a current track that should be playing, check if it got paused
    if (this.currentAudio && this.currentKey) {
      if (this.currentAudio.paused) {
        const p = this.currentAudio.play();
        if (p) p.catch(() => {});
      }
    }
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

    // CRITICAL: Stop ALL pool elements before starting a new track.
    // This prevents music layering from unlock() play/pause race conditions
    // and ensures only one track plays at a time.
    this._stopAllPoolElements(fadeOut);

    // Reuse pre-created pool element if available, otherwise create new
    let audio = this._pool[key];
    if (audio) {
      audio.loop = loop;
      audio.volume = 0;
      audio.currentTime = 0;
    } else {
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
        this._fadeInAudio(audio, volume, fadeIn);
        if (onStarted) onStarted();
      }).catch(() => {
        if (this.currentAudio === audio) {
          this.currentAudio = null;
          this.currentKey = null;
        }
      });
    } else {
      this._fadeInAudio(audio, volume, fadeIn);
      if (onStarted) onStarted();
    }
  }

  /**
   * Stop all music with optional fade out.
   */
  stopMusic(fadeOut = 500) {
    // Stop ALL pool elements, not just currentAudio, to prevent orphaned playback
    this._stopAllPoolElements(fadeOut);
    this.currentAudio = null;
    this.currentKey = null;
  }

  /**
   * Pause and reset every element in the pool. Prevents any stale playback.
   */
  _stopAllPoolElements(fadeOut) {
    for (const audio of Object.values(this._pool)) {
      if (audio === this.currentAudio && fadeOut > 0) {
        this._fadeOutAudio(audio, fadeOut);
      } else {
        // Hard stop all others immediately
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 0;
        } catch {}
      }
    }
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
   * Toggle mute/unmute for music.
   */
  toggleMute() {
    this._muted = !this._muted;
    if (this.currentAudio) {
      if (this._muted) {
        this._muteVolume = this.currentAudio.volume;
        this.currentAudio.volume = 0;
      } else {
        this.currentAudio.volume = this._muteVolume || 0.4;
      }
    }
    return this._muted;
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

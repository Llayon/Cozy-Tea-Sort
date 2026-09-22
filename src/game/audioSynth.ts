/**
 * Cozy Web Audio ASMR Synthesizer
 * Generates organic liquid pouring/bubbling sounds, warm glass chimes,
 * pentatonic completion chords, and haptic feedback triggers.
 */

class CozyAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private activePourNodes: { stop: () => void } | null = null;

  constructor() {
    // Read mute preference from localStorage if available
    try {
      this.isMuted = localStorage.getItem('cozy_tea_muted') === 'true';
    } catch {
      this.isMuted = false;
    }
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  get muted(): boolean {
    return this.isMuted;
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    try {
      localStorage.setItem('cozy_tea_muted', String(muted));
    } catch {
      // ignore
    }
    if (muted && this.activePourNodes) {
      this.activePourNodes.stop();
      this.activePourNodes = null;
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /**
   * Sound of touching/selecting a glass mug (soft delicate bell-like ping)
   */
  playSelect() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.08);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.25);
  }

  /**
   * Sound of invalid move (soft, warm ceramic clunk)
   */
  playInvalid() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.12);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.16);
  }

  /**
   * Procedural ASMR tea pouring and bubbling sound
   * Generates bandpass-filtered noise + randomized liquid droplet sines
   */
  playPour(durationSec: number = 0.8) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    if (this.activePourNodes) {
      this.activePourNodes.stop();
      this.activePourNodes = null;
    }

    const t = this.ctx.currentTime;
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = Math.floor(sampleRate * durationSec);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = noiseBuffer.getChannelData(0);

    // Filtered pink-ish noise for water flow
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.05;
      b1 = 0.96300 * b1 + white * 0.11;
      b2 = 0.57000 * b2 + white * 0.25;
      data[i] = (b0 + b1 + b2) * 0.4;
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, t);
    filter.frequency.linearRampToValueAtTime(1100, t + durationSec);
    filter.Q.setValueAtTime(3.5, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, t);
    noiseGain.gain.linearRampToValueAtTime(0.18, t + 0.08);
    noiseGain.gain.setValueAtTime(0.18, t + durationSec - 0.1);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + durationSec);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    noiseSource.start(t);
    noiseSource.stop(t + durationSec);

    // Add 4-7 tiny droplet bubbles during the pour
    const bubbleCount = Math.floor(durationSec * 7);
    const bubbleOscs: OscillatorNode[] = [];

    for (let i = 0; i < bubbleCount; i++) {
      const dropTime = t + 0.05 + (i / bubbleCount) * (durationSec - 0.1) + (Math.random() * 0.03 - 0.015);
      const bOsc = this.ctx.createOscillator();
      const bGain = this.ctx.createGain();

      const startFreq = 700 + Math.random() * 600;
      const endFreq = startFreq + 250 + Math.random() * 300;

      bOsc.type = 'sine';
      bOsc.frequency.setValueAtTime(startFreq, dropTime);
      bOsc.frequency.exponentialRampToValueAtTime(endFreq, dropTime + 0.04);

      bGain.gain.setValueAtTime(0.001, dropTime);
      bGain.gain.linearRampToValueAtTime(0.08, dropTime + 0.01);
      bGain.gain.exponentialRampToValueAtTime(0.0001, dropTime + 0.045);

      bOsc.connect(bGain);
      bGain.connect(this.ctx.destination);

      bOsc.start(dropTime);
      bOsc.stop(dropTime + 0.05);
      bubbleOscs.push(bOsc);
    }

    this.activePourNodes = {
      stop: () => {
        try {
          noiseSource.stop();
          bubbleOscs.forEach((o) => {
            try { o.stop(); } catch { /* ignore */ }
          });
        } catch {
          // ignore
        }
      },
    };
  }

  /**
   * Sound of undoing a move
   */
  playUndo() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.18);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.22);
  }

  /**
   * Cozy pentatonic celebration chord upon puzzle completion
   */
  playWin() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // Pentatonic notes: C5 (523Hz), E5 (659Hz), G5 (784Hz), A5 (880Hz), C6 (1046Hz), E6 (1318Hz)
    const notes = [523.25, 659.25, 783.99, 880.00, 1046.50, 1318.51];

    notes.forEach((freq, index) => {
      if (!this.ctx) return;
      const noteTime = t + index * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = index % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.001, noteTime);
      gain.gain.linearRampToValueAtTime(0.15, noteTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.6);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.65);
    });
  }
}

export const audioSynth = new CozyAudioSynthesizer();

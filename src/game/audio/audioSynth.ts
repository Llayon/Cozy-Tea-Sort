/**
 * Authoritative Web Audio synth (moved from the monolith unchanged
 * in behavior). Short procedural effects only — no background music.
 *
 * Guarantees: mute actually mutes + persists, context initializes only
 * after interaction, interrupted pour nodes are cleaned up.
 */

export class CozyAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted = false;
  private activePourNodes: { stop: () => void } | null = null;

  constructor() {
    try {
      this.isMuted =
        typeof localStorage !== 'undefined' && localStorage.getItem('cozy_tea_muted') === 'true';
    } catch {
      this.isMuted = false;
    }
  }

  private initContext() {
    // AudioContext is created lazily on first user-gesture-driven call.
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

  /** Stop any in-flight pour sound (level change / mute / unmount). */
  stopPour() {
    if (this.activePourNodes) {
      try {
        this.activePourNodes.stop();
      } catch {
        // ignore
      }
      this.activePourNodes = null;
    }
  }

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
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

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
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  playPour(durationSec = 0.42) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    if (this.activePourNodes) {
      this.activePourNodes.stop();
      this.activePourNodes = null;
    }

    const ctx = this.ctx;
    const t = ctx.currentTime;
    const sampleRate = ctx.sampleRate;
    const bufferSize = Math.max(1, Math.floor(sampleRate * durationSec));
    const noiseBuffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = noiseBuffer.getChannelData(0);

    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.05;
      b1 = 0.963 * b1 + white * 0.11;
      b2 = 0.57 * b2 + white * 0.25;
      data[i] = (b0 + b1 + b2) * 0.35;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, t);
    filter.frequency.linearRampToValueAtTime(1100, t + durationSec);
    filter.Q.setValueAtTime(3.5, t);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, t);
    noiseGain.gain.linearRampToValueAtTime(0.16, t + 0.08);
    noiseGain.gain.setValueAtTime(0.16, Math.max(t + 0.08, t + durationSec - 0.08));
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + durationSec);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noiseSource.start(t);
    noiseSource.stop(t + durationSec);

    // Droplet bubbles
    const bubbleCount = Math.floor(durationSec * 7);
    const bubbleOscs: OscillatorNode[] = [];

    for (let i = 0; i < bubbleCount; i++) {
      const dropTime =
        t + 0.05 + (i / Math.max(1, bubbleCount)) * Math.max(0, durationSec - 0.1) + (Math.random() * 0.03 - 0.015);
      const bOsc = ctx.createOscillator();
      const bGain = ctx.createGain();

      const startFreq = 720 + Math.random() * 550;
      const endFreq = startFreq + 220 + Math.random() * 280;

      bOsc.type = 'sine';
      bOsc.frequency.setValueAtTime(startFreq, dropTime);
      bOsc.frequency.exponentialRampToValueAtTime(endFreq, dropTime + 0.04);

      bGain.gain.setValueAtTime(0.001, dropTime);
      bGain.gain.linearRampToValueAtTime(0.08, dropTime + 0.01);
      bGain.gain.exponentialRampToValueAtTime(0.0001, dropTime + 0.045);

      bOsc.connect(bGain);
      bGain.connect(ctx.destination);

      bOsc.start(dropTime);
      bOsc.stop(dropTime + 0.05);
      bOsc.onended = () => {
        bOsc.disconnect();
        bGain.disconnect();
      };
      bubbleOscs.push(bOsc);
    }

    noiseSource.onended = () => {
      noiseSource.disconnect();
      filter.disconnect();
      noiseGain.disconnect();
      if (this.activePourNodes?.stop === stopFn) {
        this.activePourNodes = null;
      }
    };
    const stopFn = () => {
      try {
        noiseSource.stop();
        bubbleOscs.forEach((o) => {
          try {
            o.stop();
          } catch {
            /* ignore */
          }
        });
      } catch {
        // ignore
      }
    };
    this.activePourNodes = { stop: stopFn };
  }

  playUndo() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.18);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.22);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  playReveal() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(1046.5, t); // C6
    osc1.frequency.exponentialRampToValueAtTime(1567.98, t + 0.16); // G6
    osc2.frequency.setValueAtTime(2093.0, t + 0.05); // C7

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(t);
    osc2.start(t + 0.05);
    osc1.stop(t + 0.48);
    osc2.stop(t + 0.48);
    osc2.onended = () => {
      osc1.disconnect();
      osc2.disconnect();
      gain.disconnect();
    };
  }

  playWin() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 880.0, 1046.5, 1318.51];

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
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  }
}

export const audioSynth = new CozyAudioSynthesizer();

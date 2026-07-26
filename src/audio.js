export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.wind = null;
    this.windGain = null;
    this.ready = false;
  }

  async init() {
    if (this.ready) {
      if (this.context?.state === 'suspended') await this.context.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0.16;
    this.master.connect(this.context.destination);
    this.createWind();
    this.ready = true;
  }

  createWind() {
    if (!this.context) return;
    const seconds = 2;
    const buffer = this.context.createBuffer(1, this.context.sampleRate * seconds, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.96 + white * 0.04;
      data[i] = last;
    }
    this.wind = this.context.createBufferSource();
    this.wind.buffer = buffer;
    this.wind.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 650;
    filter.Q.value = 0.6;
    this.windGain = this.context.createGain();
    this.windGain.gain.value = 0;
    this.wind.connect(filter).connect(this.windGain).connect(this.master);
    this.wind.start();
  }

  setIntensity(speed, danger) {
    if (!this.ready || !this.windGain) return;
    const now = this.context.currentTime;
    const value = Math.min(0.7, 0.08 + speed / 1800 + danger * 0.28);
    this.windGain.gain.cancelScheduledValues(now);
    this.windGain.gain.linearRampToValueAtTime(value, now + 0.12);
  }

  tone(frequency = 440, duration = 0.12, type = 'sine', volume = 0.35, slide = 0) {
    if (!this.ready) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  jump() { this.tone(260, 0.18, 'triangle', 0.28, 220); }
  land(perfect) { this.tone(perfect ? 680 : 180, perfect ? 0.18 : 0.11, perfect ? 'sine' : 'square', perfect ? 0.38 : 0.16, perfect ? 180 : -50); }
  pickup() { this.tone(840, 0.11, 'sine', 0.28, 260); }
  crash() { this.tone(110, 0.38, 'sawtooth', 0.34, -65); }
  boost() { this.tone(300, 0.36, 'sawtooth', 0.22, 500); }
  companion() {
    this.tone(480, 0.1, 'sine', 0.24, 160);
    setTimeout(() => this.tone(720, 0.14, 'sine', 0.2, 170), 80);
  }
}

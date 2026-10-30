// Recettes des sons synthétisés (handoff, lot 4 ; maquette « Plateau v4 », `static SYN`). Chaque son est une courte
// combinaison d'oscillateurs et de bruit blanc filtré, avec une enveloppe exponentielle.

export type SoundName =
  | 'ui'
  | 'select'
  | 'step'
  | 'swing'
  | 'arrow'
  | 'fire'
  | 'ice'
  | 'stone'
  | 'fireball'
  | 'hit'
  | 'hitHard'
  | 'death'
  | 'burn'
  | 'frost'
  | 'summon'
  | 'terrain'
  | 'card'
  | 'spell'
  | 'flip'
  | 'bomb'
  | 'net'
  | 'trapSet'
  | 'charge'
  | 'gust'
  | 'blocked'
  | 'mana'
  | 'vp'
  | 'turn'
  | 'win'
  | 'cutIn';

/** Outils de synthèse : `t` est un instant de l'AudioContext, les fréquences en Hz, les durées en secondes. */
export interface SynthKit {
  /** Oscillateur de `f` à `f2` (glissando exponentiel), volume `v`, attaque `a`. */
  tone(t: number, f: number, f2: number, dur: number, v: number, type?: OscillatorType, a?: number): void;
  /** Bruit blanc filtré, fréquence du filtre de `f` à `f2`. */
  noise(t: number, dur: number, v: number, filter?: BiquadFilterType, f?: number, f2?: number, q?: number, a?: number): void;
  /** `n` petits craquements répartis sur `dur`. */
  crackle(t: number, dur: number, n: number, v: number): void;
}

export const RECIPES: Readonly<Record<SoundName, (k: SynthKit, t: number) => void>> = {
  ui: (k, t) => k.tone(t, 900, 700, 0.06, 0.08, 'triangle'),
  select: (k, t) => {
    k.noise(t, 0.08, 0.12, 'bandpass', 2600, 4200, 2);
    k.tone(t, 1200, 1500, 0.05, 0.05, 'triangle');
  },
  step: (k, t) => {
    k.tone(t, 110, 55, 0.09, 0.22);
    k.noise(t, 0.06, 0.14, 'lowpass', 700, 300);
  },
  swing: (k, t) => k.noise(t, 0.24, 0.35, 'bandpass', 500, 2600, 1.4, 0.12),
  arrow: (k, t) => {
    k.tone(t, 180, 150, 0.14, 0.25, 'triangle');
    k.noise(t + 0.02, 0.28, 0.22, 'bandpass', 3800, 1400, 4, 0.04);
  },
  fire: (k, t) => {
    k.tone(t, 180, 150, 0.14, 0.2, 'triangle');
    k.noise(t, 0.45, 0.3, 'lowpass', 500, 1800, 1, 0.08);
    k.crackle(t, 0.45, 9, 0.25);
  },
  ice: (k, t) => {
    k.tone(t, 180, 150, 0.14, 0.2, 'triangle');
    k.noise(t + 0.02, 0.3, 0.18, 'bandpass', 5000, 2500, 3, 0.04);
    [2093, 2637, 3136].forEach((f, i) => k.tone(t + 0.05 + i * 0.06, f, f, 0.3, 0.06));
  },
  stone: (k, t) => {
    k.tone(t, 140, 50, 0.25, 0.5);
    k.noise(t, 0.2, 0.3, 'lowpass', 600, 200);
    k.noise(t + 0.1, 0.7, 0.18, 'bandpass', 220, 520, 1.5, 0.3);
  },
  fireball: (k, t) => {
    k.noise(t, 0.9, 0.45, 'lowpass', 250, 1600, 1, 0.25);
    k.crackle(t, 0.9, 16, 0.25);
    k.tone(t, 70, 110, 0.9, 0.12, 'sawtooth', 0.2);
  },
  hit: (k, t) => {
    k.tone(t, 170, 55, 0.18, 0.5);
    k.noise(t, 0.09, 0.35, 'lowpass', 2400, 600);
  },
  hitHard: (k, t) => {
    k.tone(t, 150, 40, 0.3, 0.7);
    k.tone(t, 90, 35, 0.25, 0.18, 'square');
    k.noise(t, 0.16, 0.5, 'lowpass', 3500, 400);
  },
  death: (k, t) => {
    k.tone(t, 440, 80, 0.6, 0.22, 'triangle');
    k.noise(t + 0.05, 0.55, 0.3, 'lowpass', 1500, 150, 1, 0.03);
    k.crackle(t + 0.1, 0.4, 8, 0.15);
  },
  burn: (k, t) => {
    k.noise(t, 0.5, 0.2, 'highpass', 3500, 2000, 1, 0.03);
    k.crackle(t, 0.5, 10, 0.25);
    k.noise(t, 0.35, 0.2, 'lowpass', 400, 1200, 1, 0.1);
  },
  frost: (k, t) => {
    [2637, 3136, 3951, 3520].forEach((f, i) => k.tone(t + i * 0.05, f, f, 0.35, 0.06));
    k.noise(t, 0.25, 0.08, 'highpass', 7000);
  },
  summon: (k, t) => {
    [523, 659, 784, 1046].forEach((f, i) => k.tone(t + i * 0.055, f, f, 0.35, 0.09, 'triangle'));
    k.tone(t + 0.18, 110, 50, 0.22, 0.45);
    k.noise(t + 0.18, 0.3, 0.1, 'highpass', 4000, 8000, 1, 0.02);
  },
  terrain: (k, t) => {
    k.tone(t, 75, 32, 0.45, 0.7);
    k.noise(t, 0.5, 0.45, 'lowpass', 900, 120);
    k.crackle(t + 0.05, 0.3, 6, 0.12);
  },
  card: (k, t) => k.noise(t, 0.22, 0.18, 'bandpass', 1800, 4500, 1.5, 0.08),
  spell: (k, t) => {
    [880, 1175, 1568, 2093].forEach((f, i) => k.tone(t + i * 0.04, f, f * 1.02, 0.4, 0.07));
    k.noise(t, 0.4, 0.08, 'highpass', 5000, 9000, 1, 0.05);
  },
  flip: (k, t) => {
    k.tone(t, 1400, 900, 0.04, 0.12, 'square');
    k.noise(t, 0.1, 0.15, 'bandpass', 3000, 3000, 2);
  },
  bomb: (k, t) => {
    k.tone(t, 100, 28, 0.7, 0.8);
    k.noise(t, 1.1, 0.9, 'lowpass', 2600, 70, 0.7);
    k.crackle(t + 0.05, 0.6, 14, 0.2);
  },
  net: (k, t) => {
    k.noise(t, 0.18, 0.25, 'bandpass', 800, 2400, 2, 0.05);
    k.tone(t + 0.12, 300, 700, 0.1, 0.15, 'triangle');
    k.tone(t + 0.24, 220, 200, 0.25, 0.08, 'sawtooth');
  },
  trapSet: (k, t) => {
    k.tone(t, 160, 90, 0.1, 0.3);
    k.tone(t + 0.05, 1600, 1600, 0.03, 0.08, 'square');
  },
  charge: (k, t) => {
    [392, 523, 659, 784].forEach((f, i) => k.tone(t + i * 0.07, f, f, 0.22, 0.08, 'square'));
    k.noise(t, 0.35, 0.15, 'bandpass', 600, 3000, 1, 0.2);
  },
  gust: (k, t) => {
    k.noise(t, 0.9, 0.5, 'bandpass', 350, 1400, 1, 0.3);
    k.noise(t + 0.1, 0.7, 0.2, 'bandpass', 900, 2600, 3, 0.25);
  },
  blocked: (k, t) => k.tone(t, 160, 120, 0.12, 0.25, 'square'),
  mana: (k, t) => {
    k.tone(t, 1318, 1318, 0.35, 0.08);
    k.tone(t + 0.03, 1976, 1976, 0.3, 0.05);
  },
  vp: (k, t) => {
    k.tone(t, 784, 784, 0.3, 0.09, 'triangle');
    k.tone(t + 0.07, 1175, 1175, 0.4, 0.08, 'triangle');
  },
  /** Carte mise en avant : un souffle qui monte, un coup sourd et un accord qui scintille. */
  cutIn: (k, t) => {
    k.noise(t, 0.32, 0.22, 'bandpass', 500, 3800, 1.2, 0.16);
    k.tone(t + 0.12, 130, 60, 0.3, 0.22);
    [659, 988, 1319, 1760].forEach((f, i) => k.tone(t + 0.14 + i * 0.03, f, f, 0.45, 0.05, 'triangle'));
  },
  turn: (k, t) => {
    k.tone(t, 196, 196, 1.4, 0.25, 'sine', 0.01);
    k.tone(t, 294, 294, 1.2, 0.12, 'sine', 0.01);
    k.tone(t, 392, 392, 1, 0.06, 'triangle', 0.01);
  },
  win: (k, t) =>
    (
      [
        [523, 0],
        [659, 0.14],
        [784, 0.28],
        [1046, 0.42],
      ] as const
    ).forEach(([f, d]) => {
      const length = d === 0.42 ? 1.2 : 0.3;
      k.tone(t + d, f, f, length, 0.14, 'triangle');
      k.tone(t + d, f / 2, f / 2, length, 0.08);
    }),
};

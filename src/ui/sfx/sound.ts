// Sons du jeu (handoff, lot 4), en Web Audio, sans bibliothèque : un seul AudioContext, créé au premier clic (règle
// d'autoplay des navigateurs), sortie → volume maître → compresseur → haut-parleurs. Les animations appellent
// `sfx('nom')` au moment de l'effet visuel. Un vrai fichier audio, s'il existe, remplace la synthèse de ce son.
import { RECIPES } from './recipes';
import type { SoundName, SynthKit } from './recipes';

export type { SoundName } from './recipes';

/**
 * Fichiers audio réels, prioritaires sur la synthèse : déposer `src/assets/sons/<nom>.mp3` (ou .ogg, .wav), par
 * exemple `bomb.mp3`, suffit à remplacer ce son, sans toucher aux appels.
 */
const FILES = import.meta.glob('../../assets/sons/*.{mp3,ogg,wav}', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>;

export const SOUND_FILES: Readonly<Partial<Record<SoundName, string>>> = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1).replace(/\.\w+$/, ''), url]),
);

let enabled = true;
let volume = 0.7;
let context: AudioContext | null = null;
let output: GainNode | null = null;
let kit: SynthKit | null = null;

/** Son coupé ou non, et volume (0 à 1). */
export function configureSound(options: { enabled: boolean; volume: number }): void {
  enabled = options.enabled;
  volume = Math.min(1, Math.max(0, options.volume));
  if (output) output.gain.value = volume;
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    const ac = new Context();
    const compressor = ac.createDynamicsCompressor();
    const out = ac.createGain();
    out.gain.value = volume;
    out.connect(compressor).connect(ac.destination);
    context = ac;
    output = out;
    kit = createKit(ac, out);
  }
  if (context.state === 'suspended') void context.resume().catch(() => undefined);
  return context;
}

/** À appeler sur un geste de l'utilisateur (premier clic) : crée ou réveille l'AudioContext. */
export function unlockAudio(): void {
  if (enabled) audio();
}

/** Joue un son, tout de suite ou après `delay` secondes. Sans effet si le son est coupé. */
export function sfx(name: SoundName, delay = 0): void {
  if (!enabled) return;
  const file = SOUND_FILES[name];
  if (file) {
    const play = () => {
      const element = new Audio(file);
      element.volume = volume;
      void element.play().catch(() => undefined);
    };
    if (delay > 0) setTimeout(play, delay * 1000);
    else play();
    return;
  }
  const ac = audio();
  if (!ac || !kit) return;
  try {
    RECIPES[name](kit, ac.currentTime + 0.01 + Math.max(0, delay));
  } catch {
    // Un son raté ne doit jamais gêner la partie.
  }
}

function createKit(ac: AudioContext, out: AudioNode): SynthKit {
  const buffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const envelope = (gain: GainNode, t: number, attack: number, dur: number, v: number) => {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(v, t + Math.min(attack, dur * 0.5));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  };
  const tone: SynthKit['tone'] = (t, f, f2, dur, v, type = 'sine', a = 0.005) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (f2 !== f) osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
    envelope(gain, t, a, dur, v);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  };
  const noise: SynthKit['noise'] = (t, dur, v, type = 'lowpass', f = 1000, f2 = f, q = 1, a = 0.005) => {
    const source = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f, t);
    if (f2 !== f) filter.frequency.exponentialRampToValueAtTime(f2, t + dur);
    envelope(gain, t, a, dur, v);
    source.connect(filter).connect(gain).connect(out);
    source.start(t, Math.random() * 0.5);
    source.stop(t + dur + 0.05);
  };
  const crackle: SynthKit['crackle'] = (t, dur, n, v) => {
    for (let i = 0; i < n; i++) {
      noise(t + Math.random() * dur, 0.02 + Math.random() * 0.03, v * (0.4 + Math.random() * 0.6), 'highpass', 2500 + Math.random() * 3000);
    }
  };
  return { tone, noise, crackle };
}

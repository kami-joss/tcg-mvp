import { describe, expect, it } from 'vitest';
import { AMBIENT_FPS, ambientFrame, driveLoops } from './ambientClock';
import type { LoopAnimation } from './ambientClock';

// Les boucles CSS d'ambiance avancent sur les images de l'ambiance, 30 par seconde, les mêmes que le plateau PixiJS.

const fake = (o: { css?: boolean; iterations?: number; currentTime?: number; paused?: boolean } = {}) => {
  const target = { closest: (selector: string) => (o.paused && selector === '.of--paused' ? {} : null) } as unknown as Element;
  const animation = {
    currentTime: o.currentTime ?? 0,
    effect: { getTiming: () => ({ iterations: o.iterations ?? Infinity }), target },
    pauses: 0,
    pause() {
      this.pauses++;
    },
    ...(o.css === false ? {} : { animationName: 'orbGlow' }),
  };
  return animation as LoopAnimation & { pauses: number };
};

describe('horloge de l’ambiance', () => {
  it('30 images par seconde ; le même numéro pour tous dans une image de l’écran', () => {
    expect(AMBIENT_FPS).toBe(30);
    expect(ambientFrame(0)).toBe(0);
    expect(ambientFrame(33)).toBe(0);
    expect(ambientFrame(34)).toBe(1);
    expect(ambientFrame(1000)).toBe(30);
  });

  it('une boucle CSS est mise en pause et avancée à la main, sa phase gardée (délai négatif compris)', () => {
    const loops = new Map<LoopAnimation, number>();
    const glow = fake({ currentTime: 700 });
    driveLoops([glow], loops, 1000);
    expect(glow.pauses).toBe(1);
    expect(glow.currentTime).toBe(700);
    driveLoops([glow], loops, 1033);
    expect(glow.currentTime).toBe(733);
    expect(glow.pauses).toBe(1);
  });

  it('pas les animations finies, ni celles lancées par un script, ni une overframe en pause', () => {
    const loops = new Map<LoopAnimation, number>();
    const once = fake({ iterations: 1, currentTime: 5 });
    const scripted = fake({ css: false, currentTime: 5 });
    const gated = fake({ paused: true, currentTime: 5 });
    driveLoops([once, scripted, gated], loops, 1000);
    driveLoops([once, scripted, gated], loops, 1100);
    expect([once.pauses, scripted.pauses]).toEqual([0, 0]);
    expect([once.currentTime, scripted.currentTime]).toEqual([5, 5]);
    // L'overframe hors écran est retenue (en pause) mais n'avance pas.
    expect(gated.pauses).toBe(1);
    expect(gated.currentTime).toBe(5);
  });

  it('une boucle disparue (classe retirée) est oubliée', () => {
    const loops = new Map<LoopAnimation, number>();
    const glow = fake();
    driveLoops([glow], loops, 0);
    driveLoops([], loops, 33);
    expect(loops.size).toBe(0);
  });
});

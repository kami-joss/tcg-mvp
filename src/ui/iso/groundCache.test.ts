import { describe, expect, it } from 'vitest';
import { GROUND_VERSION, fingerprint, groundKey } from './groundCache';

describe('cache des sols peints : clés', () => {
  it('empreinte : la même pour le même décor, une autre dès qu’il change', () => {
    expect(fingerprint('{"a":1}')).toBe(fingerprint('{"a":1}'));
    expect(fingerprint('{"a":1}')).not.toBe(fingerprint('{"a":2}'));
  });

  it('clé : carte, empreinte du décor, version du calcul et densité', () => {
    const decor = { plan: { densite: 1.5 } };
    const key = groundKey('Champ de bataille (15 × 15)|monde', decor, 1.5);
    expect(key).toBe(`Champ de bataille (15 × 15)|monde|${fingerprint(JSON.stringify(decor))}|${GROUND_VERSION}|1.5`);
    expect(groundKey('Champ de bataille (15 × 15)|monde', decor, 1)).not.toBe(key);
  });
});

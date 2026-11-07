import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SessionScreen } from './SessionScreen';
import { DEFAULT_SETUP, newSession, rollOpening, updateSession } from './session';
import type { Session } from './session';

const render = (session: Session) => renderToStaticMarkup(<SessionScreen session={session} dispatch={() => {}} onHome={() => {}} />);
const afterEndTurn = () => updateSession(newSession(1), { type: 'play', action: { type: 'endTurn' } });

describe('écran de passage hotseat (SPEC.md §4.3, §7)', () => {
  it('masque tout : seul le message de passage est affiché', () => {
    const html = render(afterEndTurn());
    expect(html).toContain('Passe l’écran au Joueur 2');
    // Ni plateau, ni panneaux, ni journal, ni cartes.
    for (const hidden of ['data-scene', 'grimoire', 'Journal', 'mana', 'Éclaireur', 'Golem']) {
      expect(html, hidden).not.toContain(hidden);
    }
  });

  it('après le clic, le joueur suivant voit son jeu', () => {
    const html = render(updateSession(afterEndTurn(), { type: 'ready' }));
    expect(html).not.toContain('Passe l’écran');
    expect(html).toContain('data-scene');
    expect(html).toContain('class="score score--p2 is-active"');
    expect(html).toContain('Mon grimoire');
  });

  it('en début de partie, le jeu de J1 s’affiche directement', () => {
    const html = render(newSession(1));
    expect(html).not.toContain('Passe l’écran');
    expect(html).toContain('class="score score--p1 is-active"');
  });
});

describe('lancer de dés d’ouverture (SPEC.md §4.1)', () => {
  const rolled = (...values: number[]) => {
    const queue = [...values];
    return rollOpening(() => (queue.shift()! - 1) / 6 + 0.01);
  };

  it('masque la partie : les dés des deux joueurs, et le choix du gagnant', () => {
    const html = render(newSession(1, undefined, rolled(2, 5)));
    expect(html).toContain('Lancer de dés');
    expect(html).toContain('aria-label="Dé de J1 : 2"');
    expect(html).toContain('aria-label="Dé de J2 : 5"');
    expect(html).toContain('J2 a le plus gros chiffre : J2 choisit s’il commence.');
    expect(html).toContain('J2 commence');
    expect(html).toContain('J1 commence');
    for (const hidden of ['data-scene', 'Mon grimoire', 'Journal']) expect(html, hidden).not.toContain(hidden);
  });

  it('égalité : le lancer précédent reste affiché, avec « on relance »', () => {
    const html = render(newSession(1, undefined, rolled(3, 3, 6, 1)));
    expect(html).toContain('Égalité : on relance');
    expect(html.match(/data-die=/g)).toHaveLength(4);
  });

  it('quand l’IA gagne : elle commence, un seul bouton', () => {
    const session = newSession(1, { ...DEFAULT_SETUP, ai: 2 }, rolled(1, 6));
    const html = render(session);
    expect(html).toContain('J2 (IA) a le plus gros chiffre et choisit de commencer.');
    expect(html).toContain('Commencer la partie');
    expect(html).not.toContain('J1 commence');
  });

  it('après le choix, le jeu du premier joueur s’affiche', () => {
    const html = render(updateSession(newSession(1, undefined, rolled(2, 5)), { type: 'chooseFirst', first: 2 }));
    expect(html).not.toContain('Qui commence');
    expect(html).toContain('class="score score--p2 is-active"');
  });
});

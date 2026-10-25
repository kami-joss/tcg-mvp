import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SessionScreen } from './SessionScreen';
import { newSession, updateSession } from './session';
import type { Session } from './session';

const render = (session: Session) => renderToStaticMarkup(<SessionScreen session={session} dispatch={() => {}} />);
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
    expect(html).toContain('class="player player--p2 is-active"');
    expect(html).toContain('Mon grimoire');
  });

  it('en début de partie, le jeu de J1 s’affiche directement', () => {
    const html = render(newSession(1));
    expect(html).not.toContain('Passe l’écran');
    expect(html).toContain('class="player player--p1 is-active"');
  });
});

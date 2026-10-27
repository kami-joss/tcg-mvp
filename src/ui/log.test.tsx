import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView } from '../engine';
import type { Action, GameState } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { ActionLog } from './ActionLog';
import { describeAction, logEntry } from './log';
import type { LogEntry } from './log';

/** Joue l'action et renvoie les lignes du journal, vues par le joueur actif. */
function logOf(state: GameState, action: Action): string[] {
  const viewer = state.activePlayer;
  return describeAction(getPlayerView(state, viewer), action, getPlayerView(applyAction(state, action), viewer));
}

describe('journal des actions (SPEC.md §7)', () => {
  it('invocation et déplacement', () => {
    const state = gameWith([{ monster: 'chevalier', owner: 1, at: at(5, 3) }]);
    expect(logOf(state, { type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos: at(0, 4) } })).toEqual([
      'J1 invoque Milicien en (0, 4).',
    ]);
    expect(logOf(state, { type: 'move', unitId: 'u1', to: at(5, 4) })).toEqual(['J1 déplace Chevalier sur la Forge.']);
  });

  it('attaque : dégâts de la cible d’abord, puis riposte', () => {
    const state = gameWith([
      { monster: 'milicien', owner: 1, at: at(8, 1) },
      { monster: 'gardien', owner: 2, at: at(8, 2) },
    ]);
    expect(logOf(state, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false })).toEqual([
      'Milicien de J1 attaque Gardien de J2.',
      'Gardien de J2 : 6 → 4 PV.',
      'Milicien de J1 : 3 → 2 PV.',
    ]);
  });

  it('destruction, VP, avancée et victoire', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'eclaireur', owner: 2, at: at(8, 2) },
      ],
      { players: { 1: { vp: 29 } } },
    );
    expect(logOf(state, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: true })).toEqual([
      'Milicien de J1 attaque Éclaireur de J2.',
      'Éclaireur de J2 est détruit.',
      'Milicien de J1 avance en (8, 2).',
      'J1 gagne 1 VP (30 au total).',
      'J1 remporte la partie !',
    ]);
  });

  it('sorts : recul et bonus', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 5) },
        { monster: 'golem', owner: 2, at: at(8, 1) },
      ],
      { players: { 1: { mana: 10 } } },
    );
    const gust: Action = {
      type: 'playCard',
      cardId: 'bourrasque',
      target: { kind: 'unitAndDirection', unitId: 'u2', direction: 'right' },
    };
    expect(logOf(state, gust)).toEqual(['J1 lance Bourrasque sur Golem de J2 vers la droite.', 'Golem de J2 recule en (8, 3).']);
    const blessing: Action = { type: 'playCard', cardId: 'benediction', target: { kind: 'unit', unitId: 'u1' } };
    expect(logOf(state, blessing)).toEqual([
      'J1 lance Bénédiction sur Milicien de J1.',
      'Milicien de J1 : 3 → 4 PV.',
      'Milicien de J1 : ATK 2 → 3.',
    ]);
  });

  it('fin du tour : revenus du joueur suivant', () => {
    const state = gameWith([{ monster: 'golem', owner: 2, at: at(5, 4) }], { players: { 2: { mana: 0 } } });
    expect(logOf(state, { type: 'endTurn' })).toEqual(['J1 termine son tour.', 'Tour 2 : J2 reçoit 5 mana et 1 VP.']);
  });

  it('pièges : la pose ne révèle pas la case ; le déclenchement est annoncé', () => {
    const poser = gameWith([{ monster: 'poseur-de-bombe', owner: 1, at: at(8, 1) }], { players: { 1: { mana: 10 } } });
    const place: Action = { type: 'activateEffect', unitId: 'u1', target: { kind: 'cell', pos: at(8, 2) } };
    expect(logOf(poser, place)).toEqual(['Poseur de bombe - Pièges de J1 pose un piège.']);

    const state = {
      ...gameWith([{ monster: 'golem', owner: 2, at: at(8, 1) }], { activePlayer: 2 }),
      traps: [{ owner: 1 as const, pos: at(8, 2), effects: [{ type: 'status' as const, kind: 'immobilise' as const, turns: 0 }], cardId: 'poseur-de-piege' as const }],
    };
    expect(logOf(state, { type: 'move', unitId: 'u1', to: at(8, 3), path: [at(8, 2), at(8, 3)] })).toEqual([
      'J2 déplace Golem en (8, 3).',
      'Golem de J2 est pris au piège en (8, 2) et ne peut plus bouger de ce tour.',
    ]);
  });

  it('Farceur invisible : ni sa case d’invocation, ni ses déplacements n’apparaissent', () => {
    const state = gameWith([{ monster: 'eclaireur', owner: 2, at: at(9, 4) }], { players: { 1: { grimoire: ['farceur'] } } });
    const summon = { type: 'playCard', cardId: 'farceur', target: { kind: 'cell', pos: at(0, 4) } } as const;
    expect(logOf(state, summon)).toEqual(['J1 invoque Farceur - Pièges, invisible.']);
    const moved = { type: 'move', unitId: 'u2', to: at(2, 2) } as const;
    const lines = logOf(applyAction(state, summon), moved);
    expect(lines).toEqual(['J1 déplace Farceur - Pièges, invisible.']);
  });

  it('un Farceur adverse qui sort de la vue disparaît, il n’est pas détruit', () => {
    const state = gameWith([
      { monster: 'eclaireur', owner: 1, at: at(9, 1) },
      { monster: 'farceur', owner: 2, at: at(9, 3) },
    ]);
    expect(logOf(state, { type: 'move', unitId: 'u1', to: at(9, 0) })).toEqual([
      'J1 déplace Éclaireur en (9, 0).',
      'Farceur - Pièges de J2 disparaît.',
    ]);
  });

  it('un Farceur adverse qui arrête un tir ou un déplacement se révèle', () => {
    const shot = gameWith([
      { monster: 'trebuchet', owner: 1, at: at(9, 0) },
      { monster: 'farceur', owner: 2, at: at(9, 3) },
      { monster: 'golem', owner: 2, at: at(9, 5) },
    ]);
    expect(logOf(shot, { type: 'attack', unitId: 'u1', targetId: 'u3', advance: false })).toEqual([
      'Trébuchet - Archers de J1 attaque Golem de J2.',
      'Farceur - Pièges de J2 apparaît en (9, 3) et arrête le tir !',
    ]);
    const walk = gameWith([
      { monster: 'chevalier', owner: 1, at: at(9, 0) },
      { monster: 'farceur', owner: 2, at: at(9, 3) },
    ]);
    expect(logOf(walk, { type: 'move', unitId: 'u1', to: at(9, 3) })).toEqual([
      'J1 déplace Chevalier en (9, 3).',
      'Farceur - Pièges de J2 apparaît en (9, 3) !',
      'Chevalier de J1 est arrêté en (9, 2) et ne peut plus bouger de ce tour.',
    ]);
  });

  it('évolution et effet de zone', () => {
    const evolving = gameWith([{ monster: 'jeune-dragon', owner: 1, at: at(5, 3) }], {
      turn: 3,
      players: { 1: { mana: 10, grimoire: ['dragon-feu'] } },
    });
    expect(logOf(evolving, { type: 'activateEffect', unitId: 'u1', target: { kind: 'card', cardId: 'dragon-feu' } })).toEqual([
      'Jeune dragon élémentaire - Dragons de J1 évolue en Dragon élémentaire de feu - Dragons en (5, 3).',
    ]);
    const blasting = gameWith(
      [
        { monster: 'dragon-feu', owner: 1, at: at(8, 2), facing: 'down' },
        { monster: 'golem', owner: 2, at: at(9, 2) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    expect(logOf(blasting, { type: 'activateEffect', unitId: 'u1', target: { kind: 'area' } })).toEqual([
      'Dragon élémentaire de feu - Dragons de J1 lance Déflagration.',
      'Golem de J2 : 7 → 5 PV.',
    ]);
    const blowing = gameWith(
      [
        { monster: 'dragon-vent', owner: 1, at: at(8, 1), facing: 'up' },
        { monster: 'golem', owner: 2, at: at(8, 2) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    expect(logOf(blowing, { type: 'activateEffect', unitId: 'u1', target: { kind: 'area', direction: 'right', distance: 2 } })).toEqual([
      'Dragon élémentaire de vent - Dragons de J1 lance Vent violent vers la droite (recul de 2).',
      'Golem de J2 recule sur la Ferme.',
    ]);
  });
});

describe('journal : une entrée par action, avec ses icônes', () => {
  const entryOf = (state: GameState, action: Action) => {
    const viewer = state.activePlayer;
    return logEntry(getPlayerView(state, viewer), action, getPlayerView(applyAction(state, action), viewer));
  };

  it('icône de l’action, camp qui agit, conséquences colorées', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'eclaireur', owner: 2, at: at(8, 2) },
        { monster: 'archer', owner: 1, at: at(6, 2) },
      ],
      { players: { 1: { vp: 3 } } },
    );
    expect(entryOf(state, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false })).toEqual({
      kind: 'action',
      player: 1,
      icon: 'broadsword',
      text: 'Milicien de J1 attaque Éclaireur de J2.',
      items: [
        { icon: 'death-skull', text: 'Éclaireur de J2 est détruit.', tone: 'hurt' },
        { icon: 'laurels', text: 'J1 gagne 1 VP (4 au total).', tone: 'vp' },
      ],
    });
    // Tir à distance, invocation, déplacement.
    expect(entryOf(state, { type: 'attack', unitId: 'u3', targetId: 'u2', advance: false }).icon).toBe('high-shot');
    expect(entryOf(state, { type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos: at(0, 4) } }).icon).toBe('dragon-head');
    expect(entryOf(state, { type: 'move', unitId: 'u3', to: at(5, 2) }).icon).toBe('walking-boot');
  });

  it('fin de tour : un séparateur de tour, avec le mana et les VP reçus', () => {
    const state = gameWith([{ monster: 'milicien', owner: 2, at: at(5, 4) }]);
    expect(entryOf(state, { type: 'endTurn' })).toMatchObject({
      kind: 'turn',
      player: 2,
      text: 'J1 termine son tour.',
      turn: { number: 2, player: 2, mana: 5, vp: 1 },
      items: [],
    });
  });
});

describe('journal : affichage', () => {
  it('une ligne par action : pastille du camp, phrase et étiquettes ; séparateur de tour', () => {
    const entries: LogEntry[] = [
      { kind: 'turn', player: 1, icon: 'water-drop', text: 'J1 commence avec 3 mana.', items: [], turn: { number: 1, player: 1, mana: 3, vp: 0 } },
      {
        kind: 'action',
        player: 1,
        icon: 'broadsword',
        text: 'Milicien de J1 attaque Éclaireur de J2.',
        items: [{ icon: 'death-skull', text: 'Éclaireur de J2 est détruit.', tone: 'hurt' }],
      },
    ];
    const html = renderToStaticMarkup(<ActionLog entries={entries} opponentUsed={[]} />);
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain('class="log__turn log__turn--p1"');
    expect(html).toContain('Tour 1 · J1');
    expect(html).toContain('class="log__entry log__entry--action log__entry--p1"');
    expect(html).toMatch(/class="log__item log__item--hurt">.*?<\/svg>Éclaireur de J2 est détruit<\/span>/);
  });
});

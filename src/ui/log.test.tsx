import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView } from '../engine';
import type { Action, GameState } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { ActionLog } from './ActionLog';
import { describeAction, logEntry, logSegments, unreadActions } from './log';
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
    expect(logOf(state, { type: 'endTurn' })).toEqual(['J1 termine son tour.', 'Tour 2 : J2 reçoit 3 mana et 1 VP.']);
  });

  it('pièges : la pose ne révèle pas la case ; le déclenchement est annoncé', () => {
    const poser = gameWith([{ monster: 'poseur-de-bombe', owner: 1, at: at(8, 1) }], { players: { 1: { mana: 10 } } });
    const place: Action = { type: 'activateEffect', unitId: 'u1', target: { kind: 'cell', pos: at(8, 2) } };
    expect(logOf(poser, place)).toEqual(['Poseur de bombe - Maîtres des pièges de J1 pose un piège.']);

    const state = {
      ...gameWith([{ monster: 'golem', owner: 2, at: at(8, 1) }], { activePlayer: 2 }),
      traps: [{ owner: 1 as const, pos: at(8, 2), effects: [{ type: 'status' as const, kind: 'immobilise' as const, turns: 0 }], cardId: 'poseur-de-piege' as const, sourceId: 'u0', expiresAtTurn: 99 }],
    };
    expect(logOf(state, { type: 'move', unitId: 'u1', to: at(8, 3), path: [at(8, 2), at(8, 3)] })).toEqual([
      'J2 déplace Golem en (8, 3).',
      'Golem de J2 est pris au piège en (8, 2) et ne peut plus bouger de ce tour.',
    ]);
  });

  it('Farceur invisible : ni sa case d’invocation, ni ses déplacements n’apparaissent', () => {
    const state = gameWith([{ monster: 'eclaireur', owner: 2, at: at(9, 4) }], { players: { 1: { grimoire: ['farceur'] } } });
    const summon = { type: 'playCard', cardId: 'farceur', target: { kind: 'cell', pos: at(0, 4) } } as const;
    expect(logOf(state, summon)).toEqual(['J1 invoque Farceur - Maîtres des pièges, invisible.']);
    const moved = { type: 'move', unitId: 'u2', to: at(2, 2) } as const;
    const lines = logOf(applyAction(state, summon), moved);
    expect(lines).toEqual(['J1 déplace Farceur - Maîtres des pièges, invisible.']);
  });

  it('un Farceur adverse qui sort de la vue disparaît, il n’est pas détruit', () => {
    const state = gameWith([
      { monster: 'eclaireur', owner: 1, at: at(9, 1) },
      { monster: 'farceur', owner: 2, at: at(9, 3) },
    ]);
    expect(logOf(state, { type: 'move', unitId: 'u1', to: at(9, 0) })).toEqual([
      'J1 déplace Éclaireur en (9, 0).',
      'Farceur - Maîtres des pièges de J2 disparaît.',
    ]);
  });

  it('un Farceur adverse qui arrête un tir ou un déplacement se révèle', () => {
    const shot = gameWith([
      { monster: 'trebuchet', owner: 1, at: at(9, 0) },
      { monster: 'farceur', owner: 2, at: at(9, 3) },
      { monster: 'golem', owner: 2, at: at(9, 5) },
    ]);
    expect(logOf(shot, { type: 'attack', unitId: 'u1', targetId: 'u3', advance: false })).toEqual([
      'Trébuchet de J1 attaque Golem de J2.',
      'Farceur - Maîtres des pièges de J2 apparaît en (9, 3) et arrête le tir !',
    ]);
    const walk = gameWith([
      { monster: 'chevalier', owner: 1, at: at(9, 0) },
      { monster: 'farceur', owner: 2, at: at(9, 3) },
    ]);
    expect(logOf(walk, { type: 'move', unitId: 'u1', to: at(9, 3) })).toEqual([
      'J1 déplace Chevalier en (9, 3).',
      'Farceur - Maîtres des pièges de J2 apparaît en (9, 3) !',
      'Chevalier de J1 est arrêté en (9, 2).',
    ]);
  });

  it('évolution et effet de zone', () => {
    const evolving = gameWith([{ monster: 'jeune-dragon', owner: 1, at: at(5, 3) }], {
      turn: 3,
      players: { 1: { mana: 10, grimoire: ['dragon-feu'] } },
    });
    expect(logOf(evolving, { type: 'activateEffect', unitId: 'u1', target: { kind: 'card', cardId: 'dragon-feu' } })).toEqual([
      'Jeune dragon - Dragons élémentaires de J1 évolue en Ignis - Dragons élémentaires en (5, 3).',
    ]);
    const blasting = gameWith(
      [
        { monster: 'dragon-feu', owner: 1, at: at(8, 2), facing: 'up' },
        { monster: 'golem', owner: 2, at: at(9, 2) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    expect(logOf(blasting, { type: 'activateEffect', unitId: 'u1', target: { kind: 'area', direction: 'down' } })).toEqual([
      'Ignis - Dragons élémentaires de J1 lance Lance-flamme vers le bas.',
      'Golem de J2 : 7 → 5 PV.',
    ]);
    // Tempête : 2 dégâts, puis recul de 2 vers l'avant (sans distance à choisir).
    const blowing = gameWith(
      [
        { monster: 'dragon-vent', owner: 1, at: at(8, 1), facing: 'up' },
        { monster: 'golem', owner: 2, at: at(8, 2) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    expect(logOf(blowing, { type: 'activateEffect', unitId: 'u1', target: { kind: 'area', direction: 'right' } })).toEqual([
      'Ventus - Dragons élémentaires de J1 lance Tempête vers la droite.',
      'Golem de J2 : 7 → 5 PV.',
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
    // Les VP d'une destruction se rangent sous elle (arborescence, 2026-11-11).
    expect(entryOf(state, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false })).toMatchObject({
      kind: 'action',
      player: 1,
      icon: 'broadsword',
      text: 'Milicien de J1 attaque Éclaireur de J2.',
      items: [
        {
          icon: 'tombstone',
          text: 'Éclaireur de J2 est détruit.',
          tone: 'hurt',
          children: [{ icon: 'crown', text: 'J1 gagne 1 VP (4 au total).', tone: 'vp' }],
        },
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
      turn: { number: 2, player: 2, mana: 3, vp: 1 },
      items: [],
    });
  });
});

describe('journal : affichage', () => {
  const entries: LogEntry[] = [
    { kind: 'turn', player: 1, icon: 'water-drop', text: 'J1 commence avec 3 mana.', items: [], turn: { number: 1, player: 1, mana: 3, vp: 0 } },
    {
      kind: 'action',
      player: 1,
      icon: 'broadsword',
      text: 'Milicien de J1 attaque Éclaireur de J2.',
      items: [
        {
          icon: 'tombstone',
          text: 'Éclaireur de J2 est détruit.',
          tone: 'hurt',
          children: [{ icon: 'crown', text: 'J1 gagne 1 VP (4 au total).', tone: 'vp' }],
        },
      ],
      names: [
        { text: 'Milicien de J1', name: 'Milicien', player: 1 },
        { text: 'Éclaireur de J2', name: 'Éclaireur', player: 2 },
      ],
    },
  ];

  it('une entrée par action en arborescence : action, conséquences, et ce qu’elles entraînent ; séparateur de tour', () => {
    const html = renderToStaticMarkup(<ActionLog entries={entries} />);
    expect(html).toContain('class="log__turn log__turn--p1"');
    expect(html).toContain('Tour 1 · Joueur 1');
    expect(html).toContain('class="log__entry log__entry--action log__entry--p1 is-latest"');
    // La destruction, puis les VP sous elle.
    expect(html).toMatch(
      /class="log__node log__node--hurt">.*?<span class="log__name log__name--p2" title="Éclaireur de J2">Éclaireur.*?est détruit<\/span><\/span><ul class="log__tree"><li class="log__node log__node--vp">.*?Joueur 1<\/b> gagne 1 VP \(4 au total\)/,
    );
    // Les noms soulignés à la couleur du camp, « de J1 » pour les lecteurs d'écran.
    expect(html).toContain('<span class="log__name log__name--p1" title="Milicien de J1">Milicien<span class="sr-only"> de J1</span></span> attaque');
    // Les cartes jouées et le cimetière sont dans leur panneau (§10) : plus de ligne « Cimetière adverse ».
    expect(html).not.toContain('Cimetière');
  });

  it('rétractable : replié, une barre avec la dernière entrée ; ouvert, un bouton pour le replier', () => {
    const closed = renderToStaticMarkup(<ActionLog entries={entries} open={false} onToggle={() => {}} viewer={1} />);
    expect(closed).toContain('class="journal journal--closed"');
    expect(closed).toContain('aria-label="Ouvrir le journal"');
    expect(closed).toContain('attaque');
    expect(closed).not.toContain('log__tree');
    const open = renderToStaticMarkup(<ActionLog entries={entries} open onToggle={() => {}} viewer={1} />);
    expect(open).toContain('aria-label="Replier le journal"');
    // Sans `onToggle`, toujours ouvert, sans bouton.
    expect(renderToStaticMarkup(<ActionLog entries={entries} open={false} />)).not.toContain('Replier');
  });

  it('replié au début de son tour : un badge compte les actions de l’adversaire pendant le sien', () => {
    const turn = (player: 1 | 2, number: number): LogEntry => ({
      kind: 'turn',
      player,
      icon: 'water-drop',
      text: `J${player === 1 ? 2 : 1} termine son tour.`,
      items: [],
      turn: { number, player, mana: 3, vp: 0 },
    });
    const act = (player: 1 | 2): LogEntry => ({ kind: 'action', player, icon: 'walking-boot', text: `J${player} déplace Milicien.`, items: [] });
    const log = [turn(1, 1), act(1), turn(2, 2), act(2), act(2), act(2), turn(1, 3)];
    expect(unreadActions(log, 1)).toEqual({ player: 2, count: 3, key: 6 });
    // Au tour de l'adversaire, rien à compter.
    expect(unreadActions(log, 2)).toBeNull();
    expect(unreadActions([...log, act(1)], 2)).toBeNull();
    const html = renderToStaticMarkup(<ActionLog entries={log} open={false} onToggle={() => {}} viewer={1} />);
    expect(html).toContain('journal--closed has-badge');
    expect(html).toContain('aria-label="Ouvrir le journal : 3 actions de Joueur 2"');
    expect(html).toContain('<span class="journal__badge">3</span>');
  });
});

describe('journal : noms et joueurs à la couleur de leur camp', () => {
  it('le nom le plus long d’abord, entre deux mots ; « J1 » devient un joueur', () => {
    const names = [
      { text: 'Milicien de J1', name: 'Milicien', player: 1 as const },
      { text: 'Milicien', name: 'Milicien', player: 1 as const },
      { text: 'Milicien de J2', name: 'Milicien', player: 2 as const },
    ];
    expect(logSegments('J1 invoque Milicien en (0, 4).', names)).toEqual([
      { kind: 'player', player: 1 },
      ' invoque ',
      { kind: 'name', name: 'Milicien', player: 1, title: 'Milicien' },
      ' en (0, 4).',
    ]);
    expect(logSegments('Milicien de J2 : 3 → 2 PV.', names)).toEqual([
      { kind: 'name', name: 'Milicien', player: 2, title: 'Milicien de J2' },
      ' : 3 → 2 PV.',
    ]);
    // Pas au milieu d'un mot.
    expect(logSegments('Supermilicien et J12', names)).toEqual(['Supermilicien et J12']);
  });

  it('une entrée nomme les unités des deux camps et la carte jouée', () => {
    const state = gameWith([{ monster: 'chevalier', owner: 1, at: at(5, 3) }, { monster: 'gardien', owner: 2, at: at(8, 2) }]);
    const viewer = state.activePlayer;
    const action: Action = { type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos: at(0, 4) } };
    const entry = logEntry(getPlayerView(state, viewer), action, getPlayerView(applyAction(state, action), viewer));
    expect(entry.names).toEqual(
      expect.arrayContaining([
        { text: 'Chevalier de J1', name: 'Chevalier', player: 1 },
        { text: 'Gardien de J2', name: 'Gardien', player: 2 },
        { text: 'Milicien', name: 'Milicien', player: 1 },
      ]),
    );
  });
});

describe('journal : arriver sur un monstre caché (§10, 2026-11-12)', () => {
  const farceur = (col: number) => ({ monster: 'farceur' as const, owner: 2 as const, at: at(0, col) });

  it('le monstre caché apparaît, l’invocation se fait sur la case où il est vraiment arrivé', () => {
    const state = gameWith([farceur(3)], { players: { 1: { mana: 10, grimoire: ['milicien'] } } });
    expect(logOf(state, { type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos: at(0, 3) } })).toEqual([
      'J1 invoque Milicien en (0, 4).',
      'Farceur - Maîtres des pièges de J2 apparaît en (0, 3) !',
    ]);
  });

  it('aucune autre case : rien n’est joué, et le journal le dit', () => {
    const state = gameWith([farceur(3), farceur(4), farceur(5)], { players: { 1: { mana: 10, grimoire: ['milicien'] } } });
    expect(logOf(state, { type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos: at(0, 4) } })).toEqual([
      'J1 veut invoquer Milicien en (0, 4), mais un monstre caché occupe la case : rien n’est joué.',
      'Farceur - Maîtres des pièges de J2 apparaît en (0, 4) !',
    ]);
  });

  it('une téléportation (Repli) se dit sur sa case d’arrivée', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 8) }, farceur(5)], { players: { 1: { mana: 10, grimoire: ['repli'] } } });
    expect(logOf(state, { type: 'playCard', cardId: 'repli', target: { kind: 'unitAndCell', unitId: 'u1', pos: at(0, 5) } })[0]).toBe(
      'J1 lance Repli : Milicien de J1 est téléporté en (0, 4).',
    );
  });
});

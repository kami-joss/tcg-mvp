import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_13, BATTLEFIELD_15, DECKS, applyAction, createGame, getLegalActions, getZoneController, getZoneStatus } from '../engine';
import type { Action, CardId, GameState } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { SEARCH, chooseAction, evaluate, knownState, lastEvaluations, strikeLosses } from './bot';

// IA d'entraînement (SPEC.md §7 bis) : une action à la fois, cherchée sur la fin du tour, sans tricher.

const isLegal = (state: GameState, action: Action) =>
  getLegalActions(state).some((a) => JSON.stringify(a) === JSON.stringify(action));

describe('IA d’entraînement', () => {
  it('ne joue que des actions légales, et finit son tour quand plus rien ne l’aide', () => {
    const broke = gameWith([], { activePlayer: 2, players: { 2: { mana: 0 } } });
    expect(chooseAction(broke, 2)).toEqual({ type: 'endTurn' });
    const rich = gameWith([], { activePlayer: 2, players: { 2: { mana: 5 } } });
    const action = chooseAction(rich, 2);
    expect(action.type).toBe('playCard');
    expect(isLegal(rich, action)).toBe(true);
  });

  it('achève un monstre adverse à sa portée', () => {
    const state = gameWith(
      [
        { monster: 'chevalier', owner: 2, at: at(5, 3) },
        { monster: 'eclaireur', owner: 1, at: at(4, 3) },
      ],
      { activePlayer: 2, players: { 2: { mana: 0 } } },
    );
    expect(chooseAction(state, 2)).toMatchObject({ type: 'attack', unitId: 'u1', targetId: 'u2' });
  });

  it('va prendre une mana zone libre', () => {
    const state = gameWith([{ monster: 'chevalier', owner: 2, at: at(8, 3) }], { activePlayer: 2, players: { 2: { mana: 0 } } });
    expect(chooseAction(state, 2)).toEqual({ type: 'move', unitId: 'u1', to: at(8, 4) });
  });

  it('ne triche pas : elle ignore les pièges adverses et les monstres qu’elle ne voit pas', () => {
    const base = gameWith([{ monster: 'chevalier', owner: 2, at: at(8, 3) }], { activePlayer: 2, players: { 2: { mana: 0 } } });
    const trapped: GameState = { ...base, traps: [{ owner: 1, pos: at(8, 4), effects: [{ type: 'damage', amount: 3 }], cardId: 'poseur-de-bombe', sourceId: 'u0', expiresAtTurn: 99 }] };
    expect(chooseAction(trapped, 2)).toEqual(chooseAction(base, 2));
    expect(knownState(trapped, 2).traps).toEqual([]);
    // Un Farceur invisible, loin de tout : absent de ce qu'elle sait.
    const hidden = gameWith([{ monster: 'farceur', owner: 1, at: at(3, 0) }], { activePlayer: 2 });
    expect(knownState(hidden, 2).units).toEqual({});
  });

  it('une partie IA contre IA va à son terme, sans action refusée', () => {
    let state = createGame(undefined, { 1: DECKS[0]!.cards, 2: DECKS[0]!.cards });
    let actions = 0;
    while (state.winner === null && state.turn <= 40 && actions < 600) {
      state = applyAction(state, chooseAction(state, state.activePlayer));
      actions++;
    }
    expect(state.winner).not.toBeNull();
  }, 60_000);

  it('deck Vampire : la partie va à son terme, sans se transformer en boucle (sans limite par tour)', () => {
    const vampire = DECKS.find((d) => d.id === 'vampire')!.cards;
    let state = createGame(undefined, { 1: vampire, 2: vampire });
    let actions = 0;
    let transforms = 0;
    let most = 0;
    while (state.winner === null && state.turn <= 40 && actions < 600) {
      const action = chooseAction(state, state.activePlayer);
      state = applyAction(state, action);
      transforms = action.type === 'endTurn' ? 0 : transforms + (state.events.some((e) => e.type === 'transform') ? 1 : 0);
      most = Math.max(most, transforms);
      actions++;
    }
    expect(state.winner).not.toBeNull();
    expect(most).toBeLessThanOrEqual(3);
  }, 60_000);
});

describe('IA : mode contestation (SPEC.md §4.4 bis)', () => {
  it('entre dans une zone de 9 cases, sans aller jusqu’à la mana zone', () => {
    // Forge du 13 × 13 en (6, 6) : à 2 pas de mobilité près, le bord de sa zone suffit.
    const state = gameWith([{ monster: 'golem', owner: 2, at: at(9, 5), mobilityLeft: 2 }], {
      board: BATTLEFIELD_13,
      mode: 'contestation',
      activePlayer: 2,
      players: { 2: { mana: 0 } },
    });
    const action = chooseAction(state, 2);
    expect(action).toMatchObject({ type: 'move', unitId: 'u1' });
    expect(getZoneController(applyAction(state, action), at(6, 6))).toBe(2);
  });

  it('un seul monstre garde une zone : le second part prendre la suivante', () => {
    // Ferme du 13 × 13 en (8, 11) : le Golem la garde, le Chevalier file vers la Forge, en (6, 6).
    const state = gameWith(
      [
        { monster: 'golem', owner: 2, at: at(8, 11) },
        { monster: 'chevalier', owner: 2, at: at(7, 10) },
      ],
      { board: BATTLEFIELD_13, mode: 'contestation', activePlayer: 2, players: { 2: { mana: 0 } } },
    );
    const after = applyAction(state, chooseAction(state, 2));
    expect(getZoneController(after, at(8, 11))).toBe(2);
    expect(getZoneController(after, at(6, 6))).toBe(2);
  });

  it('une partie IA contre IA sur le 13 × 13 se joue sans action refusée', () => {
    let state = createGame(BATTLEFIELD_13, { 1: DECKS[0]!.cards, 2: DECKS[1]!.cards }, undefined, 'contestation');
    let actions = 0;
    while (state.winner === null && state.turn <= 16 && actions < 300) {
      state = applyAction(state, chooseAction(state, state.activePlayer));
      actions++;
    }
    expect(state.turn).toBeGreaterThan(10);
    expect(state.players[1].vp + state.players[2].vp).toBeGreaterThan(0);
  }, 60_000);
});

describe('IA : deux coups d’avance pour un même monstre', () => {
  it('Flèche divine, puis l’archer achève l’ennemi à 3 cases', () => {
    const state = gameWith(
      [
        { monster: 'archer-leger', owner: 1, at: at(9, 0), mobilityLeft: 0 },
        { monster: 'eclaireur', owner: 2, at: at(6, 0) },
      ],
      { players: { 1: { mana: 2, grimoire: ['fleche-divine'] as CardId[] } } },
    );
    const arrow: Action = { type: 'playCard', cardId: 'fleche-divine', target: { kind: 'unit', unitId: 'u1' } };
    expect(chooseAction(state, 1)).toEqual(arrow);
    expect(chooseAction(applyAction(state, arrow), 1)).toMatchObject({ type: 'attack', unitId: 'u1', targetId: 'u2' });
  });

  it('Dopage, puis Jean Bon détruit le Golem', () => {
    const state = gameWith(
      [
        { monster: 'jean-bon', owner: 1, at: at(8, 1), mobilityLeft: 0 },
        { monster: 'golem', owner: 2, at: at(7, 1) },
      ],
      { players: { 1: { mana: 2, grimoire: [] as CardId[] } } },
    );
    const dopage = chooseAction(state, 1);
    expect(dopage).toEqual({ type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u1' } });
    expect(chooseAction(applyAction(state, dopage), 1)).toMatchObject({ type: 'attack', unitId: 'u1', targetId: 'u2' });
  });

  it('Pénombre pour cacher des monstres piège menacés, pas sans menace', () => {
    // Deux Trébuchets visent chacun un monstre piège : 5 mana pour en sauver deux. Pour un seul Poseur à 1 mana, elle
    // garde son sort (voir « sorts gardés pour un moment décisif »).
    const threatened = gameWith(
      [
        { monster: 'poseur-de-piege', owner: 1, at: at(3, 1), mobilityLeft: 0 },
        { monster: 'clown-assassin', owner: 1, at: at(3, 7), mobilityLeft: 0 },
        { monster: 'trebuchet', owner: 2, at: at(8, 1) },
        { monster: 'trebuchet', owner: 2, at: at(8, 7) },
      ],
      { players: { 1: { mana: 5, grimoire: ['penombre'] as CardId[] } } },
    );
    const penombre: Action = { type: 'playCard', cardId: 'penombre', target: { kind: 'all' } };
    expect(chooseAction(threatened, 1)).toEqual(penombre);
    const { u3: _a, u4: _b, ...mine } = threatened.units;
    expect(chooseAction({ ...threatened, units: mine }, 1)).not.toEqual(penombre);
  });
});

describe('IA : effets actifs des monstres', () => {
  it('un effet utile passe avant une carte qui lui prendrait son mana', () => {
    const state = gameWith(
      [
        { monster: 'mage', owner: 1, at: at(5, 2), mobilityLeft: 0, hasAttacked: true },
        { monster: 'golem', owner: 2, at: at(7, 2) },
      ],
      { players: { 1: { mana: 2, grimoire: ['milicien'] as CardId[] } } },
    );
    expect(chooseAction(state, 1)).toEqual({ type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u2' } });
  });

  it('elle approche un monstre pour qu’il puisse lancer son effet, puis le lance', () => {
    const state = gameWith(
      [
        { monster: 'mage', owner: 1, at: at(2, 3), hasAttacked: true },
        { monster: 'eclaireur', owner: 2, at: at(6, 3) },
      ],
      { players: { 1: { mana: 2, grimoire: [] as CardId[] } } },
    );
    const move = chooseAction(state, 1);
    expect(move).toMatchObject({ type: 'move', unitId: 'u1' });
    expect(chooseAction(applyAction(state, move), 1)).toEqual({
      type: 'activateEffect',
      unitId: 'u1',
      target: { kind: 'unit', unitId: 'u2' },
    });
  });

  it('elle pose ses monstres après ses déplacements utiles', () => {
    const state = gameWith([{ monster: 'chevalier', owner: 1, at: at(1, 4) }], {
      players: { 1: { mana: 2, grimoire: ['milicien'] as CardId[] } },
    });
    expect(chooseAction(state, 1)).toMatchObject({ type: 'move', unitId: 'u1' });
  });
});

describe('IA : ce que l’adversaire peut faire au prochain tour', () => {
  it('chaque monstre adverse ne frappe qu’une fois : un second Milicien à sa portée ne coûte rien de plus', () => {
    // Le Golem (J2, 4 ATK, 2 de mobilité) peut aller détruire l'un ou l'autre Milicien (3 PV), pas les deux.
    const one = gameWith([
      { monster: 'golem', owner: 2, at: at(6, 2) },
      { monster: 'milicien', owner: 1, at: at(4, 2) },
    ]);
    const two = gameWith([
      { monster: 'golem', owner: 2, at: at(6, 2) },
      { monster: 'milicien', owner: 1, at: at(4, 2) },
      { monster: 'milicien', owner: 1, at: at(8, 2) },
    ]);
    expect(strikeLosses(one, 2)).toBeGreaterThan(12); // Un monstre détruit : sa valeur, plus le VP qu'il rapporte.
    expect(strikeLosses(two, 2)).toBe(strikeLosses(one, 2));
  });
});

describe('IA : recherche dans un budget de calcul', () => {
  it('s’arrête au budget : moins d’évaluations qu’une recherche sans limite, et toujours une action légale', () => {
    const state = createGame(BATTLEFIELD_13, { 1: DECKS[0]!.cards, 2: DECKS[0]!.cards });
    const free = chooseAction(state, 1, { ...SEARCH, budget: Infinity });
    const unlimited = lastEvaluations();
    const capped = chooseAction(state, 1, { ...SEARCH, budget: 10 });
    expect(lastEvaluations()).toBeLessThan(unlimited);
    for (const action of [free, capped]) expect(isLegal(state, action)).toBe(true);
  });
});

describe('IA : valeur des pièges', () => {
  // Deux Chevaliers de J1, chacun à 2 cases d'un des pièges : les deux sont à portée.
  const trapAt = (row: number, col: number): GameState => ({
    ...gameWith(
      [
        { monster: 'chevalier', owner: 1, at: at(8, 6) },
        { monster: 'chevalier', owner: 1, at: at(1, 3) },
      ],
      { activePlayer: 2 },
    ),
    traps: [{ owner: 2, pos: at(row, col), effects: [{ type: 'damage', amount: 3 }], cardId: 'poseur-de-bombe', sourceId: 'u0', expiresAtTurn: 99 }],
  });

  it('préfère un piège sur une mana zone à un piège dans son coin', () => {
    expect(evaluate(trapAt(8, 4), 2)).toBeGreaterThan(evaluate(trapAt(1, 1), 2));
  });

  it('un monstre piège s’avance avant de poser son piège, au lieu de le poser là où il apparaît', () => {
    const state = gameWith([{ monster: 'poseur-de-bombe', owner: 2, at: at(8, 1) }], { activePlayer: 2, players: { 2: { mana: 2, grimoire: [] } } });
    const action = chooseAction(state, 2);
    expect(action.type === 'move' || action.type === 'activateEffect').toBe(true);
    if (action.type === 'activateEffect' && action.target.kind === 'cell') {
      expect(Math.abs(action.target.pos.col - 1) + Math.abs(action.target.pos.row - 8)).toBeLessThanOrEqual(1);
    }
  });

  it('un piège ne vaut que si un ennemi peut marcher dessus à son prochain tour', () => {
    const withEnemy = (row: number, trap = true): GameState => ({
      ...gameWith([{ monster: 'chevalier', owner: 1, at: at(row, 1) }], { activePlayer: 2 }),
      traps: trap ? [{ owner: 2, pos: at(8, 4), effects: [{ type: 'damage', amount: 3 }], cardId: 'poseur-de-bombe', sourceId: 'u0', expiresAtTurn: 99 }] : [],
    });
    // Chevalier : 3 de mobilité ; à 3 cases (sur la rangée du piège) il l'atteint, à 11 non : le piège ne vaut rien.
    expect(evaluate(withEnemy(8), 2)).toBeGreaterThan(evaluate(withEnemy(8, false), 2) + 0.5);
    expect(evaluate(withEnemy(0), 2)).toBe(evaluate(withEnemy(0, false), 2));
  });

  it('ne pose pas de piège quand aucun ennemi ne peut l’atteindre au prochain tour', () => {
    // Un Chevalier de J1 au loin : le Poseur de bombe est sur la Ferme, mais rien ne passera par là.
    const state = gameWith(
      [
        { monster: 'poseur-de-bombe', owner: 2, at: at(8, 4), mobilityLeft: 0 },
        { monster: 'chevalier', owner: 1, at: at(1, 1) },
      ],
      { activePlayer: 2, players: { 2: { mana: 5, grimoire: [] } } },
    );
    expect(chooseAction(state, 2)).toEqual({ type: 'endTurn' });
  });

  it('ne pose pas un piège qui ne rapporte presque rien : loin de tout, sans ennemi en vue', () => {
    const state = gameWith([{ monster: 'poseur-de-piege', owner: 1, at: at(0, 0), mobilityLeft: 0 }], { players: { 1: { mana: 5, grimoire: [] } } });
    expect(chooseAction(state, 1)).toEqual({ type: 'endTurn' });
  });
});

/** Joue le tour de `me` jusqu'à sa fin ; rend les actions jouées (et l'état d'arrivée). */
function playTurn(state: GameState, me: 1 | 2): { actions: Action[]; state: GameState } {
  const actions: Action[] = [];
  let current = state;
  for (let i = 0; i < 40; i++) {
    const action = chooseAction(current, me);
    if (action.type === 'endTurn') break;
    actions.push(action);
    current = applyAction(current, action);
  }
  return { actions, state: current };
}

describe('IA : mode contestation, ce que rapportent les zones (15 × 15)', () => {
  const board = BATTLEFIELD_15;
  const mode = 'contestation';

  it('une zone que l’adversaire tient en fin de tour lui rapporte aussitôt : la contester vaut un VP', () => {
    // Forge (7, 7) tenue par un Chevalier de J1 ; l'Éclaireur de J2 juste dehors, ou dedans (contestée).
    const withScout = (row: number) =>
      gameWith(
        [
          { monster: 'chevalier', owner: 1, at: at(7, 7) },
          { monster: 'eclaireur', owner: 2, at: at(row, 7) },
        ],
        { board, mode, activePlayer: 2, players: { 2: { mana: 0, grimoire: [] } } },
      );
    expect(evaluate(withScout(8), 2) - evaluate(withScout(9), 2)).toBeGreaterThan(12);
  });

  it('un petit monstre va contester une zone adverse, même s’il risque d’y être détruit', () => {
    const state = gameWith(
      [
        { monster: 'chevalier', owner: 1, at: at(7, 7) },
        { monster: 'eclaireur', owner: 2, at: at(9, 7) },
      ],
      { board, mode, activePlayer: 2, players: { 2: { mana: 0, grimoire: [] } } },
    );
    const { state: after } = playTurn(state, 2);
    expect(getZoneStatus(after, at(7, 7)).contested).toBe(true);
  });

  it('une zone qu’un de ses terrains tient garde son gardien : le terrain ne vaut qu’1 unité contre le nombre', () => {
    // Bastion de J1 sur l'Écurie (2, 2), un Chevalier dans la zone : il y reste (un ennemi seul égaliserait le terrain).
    const state = gameWith(
      [
        { terrain: 'bastion', owner: 1, at: at(2, 2) },
        { monster: 'chevalier', owner: 1, at: at(2, 3) },
      ],
      { board, mode, players: { 1: { mana: 0, grimoire: [] } } },
    );
    const action = chooseAction(state, 1);
    expect(action).not.toMatchObject({ type: 'move', unitId: 'u2' });
    expect(getZoneController(applyAction(state, action), at(2, 2))).toBe(1);
  });

  it('un gardien ne lâche pas sa zone pour la rendre « à prendre » aux alliés qui en sont proches', () => {
    // J2 tient la Forge (terrain), la Mine et la Ferme ; ses autres monstres sont loin des zones de J1 (Écurie,
    // Scierie). Si le Gardien sortait de la Ferme, elle deviendrait une zone à prendre toute proche d'eux.
    const state = gameWith(
      [
        { terrain: 'bastion', owner: 2, at: at(7, 7) },
        { monster: 'chevalier', owner: 2, at: at(2, 13) },
        { monster: 'eclaireur', owner: 2, at: at(3, 13) },
        { monster: 'chasseur-de-primes', owner: 2, at: at(6, 13) },
        { monster: 'gardien', owner: 2, at: at(12, 13) },
        { monster: 'milicien', owner: 2, at: at(13, 14) },
        { monster: 'chevalier', owner: 1, at: at(2, 2) },
        { terrain: 'terrain-piege', owner: 1, at: at(12, 2) },
        { monster: 'emma-chauve-souris', owner: 1, at: at(8, 8) },
      ],
      { board, mode, activePlayer: 2, players: { 2: { mana: 0, grimoire: [] } } },
    );
    expect(getZoneController(playTurn(state, 2).state, at(12, 12))).toBe(2);
  });

  it('une zone tenue que l’adversaire peut venir contester vaut moins qu’une zone hors de sa portée', () => {
    const withEnemy = (col: number) =>
      gameWith(
        [
          { monster: 'chevalier', owner: 1, at: at(2, 2) },
          { monster: 'chevalier', owner: 2, at: at(5, col) },
        ],
        { board, mode, players: { 1: { mana: 0, grimoire: [] } } },
      );
    // Chevalier adverse : 3 + 1 de mobilité ; à 3 cases de l'Écurie, ou à 11.
    const near = withEnemy(2);
    const far = withEnemy(14);
    expect(evaluate(far, 1) - evaluate(near, 1)).toBeGreaterThan(4);
  });
});

describe('IA : sorts gardés pour un moment décisif', () => {
  it('ne lance ni Bénédiction ni Charge quand ils ne changent rien', () => {
    // Le Chevalier tient l'Écurie, sans ennemi en vue : rien à protéger ni à prendre.
    const state = gameWith([{ monster: 'chevalier', owner: 1, at: at(2, 4) }], {
      players: { 1: { mana: 2, grimoire: ['benediction', 'charge'] as CardId[] } },
    });
    const { actions } = playTurn(state, 1);
    expect(actions.filter((a) => a.type === 'playCard')).toEqual([]);
  });

  it('Bénédiction pour sauver un monstre d’une destruction', () => {
    // Le Golem (4 ATK) peut venir détruire le Chevalier (4 PV) ; avec +1 PV, il y survit.
    const state = gameWith(
      [
        { monster: 'chevalier', owner: 1, at: at(1, 1), mobilityLeft: 0, hasAttacked: true },
        { monster: 'golem', owner: 2, at: at(1, 4) },
      ],
      { players: { 1: { mana: 1, grimoire: ['benediction'] as CardId[] } } },
    );
    expect(chooseAction(state, 1)).toEqual({ type: 'playCard', cardId: 'benediction', target: { kind: 'unit', unitId: 'u1' } });
  });

  it('Boule de feu pour détruire, pas pour entamer', () => {
    const facing = (monster: 'eclaireur' | 'golem') =>
      gameWith(
        [
          { monster: 'chevalier', owner: 1, at: at(1, 0), mobilityLeft: 0, hasAttacked: true },
          { monster, owner: 2, at: at(1, 3) },
        ],
        { players: { 1: { mana: 2, grimoire: ['boule-de-feu'] as CardId[] } } },
      );
    const fireball = (target: string): Action => ({ type: 'playCard', cardId: 'boule-de-feu', target: { kind: 'unit', unitId: target } });
    expect(chooseAction(facing('eclaireur'), 1)).toEqual(fireball('u2'));
    expect(chooseAction(facing('golem'), 1)).not.toEqual(fireball('u2'));
  });
});

describe('IA : échanges', () => {
  it('un monstre qu’un allié peut venger coûte moins cher à perdre', () => {
    // Le Golem de J2 peut détruire le Milicien dans la Scierie ; Arnold (7 ATK), à son entrée, peut ensuite venir
    // détruire le Golem.
    const alone = gameWith([
      { monster: 'golem', owner: 2, at: at(6, 2) },
      { monster: 'milicien', owner: 1, at: at(4, 2) },
    ]);
    const avenged = gameWith([
      { monster: 'golem', owner: 2, at: at(6, 2) },
      { monster: 'milicien', owner: 1, at: at(4, 2) },
      { monster: 'arnold', owner: 1, at: at(3, 1) },
    ]);
    expect(strikeLosses(avenged, 2)).toBeLessThan(strikeLosses(alone, 2) - 6);
  });
});

describe('IA : pas d’allers-retours', () => {
  it('partie Pièges contre Pièges en contestation sur le 15 × 15 : aucun monstre ne refait son dernier pas en sens inverse', () => {
    const traps = DECKS.find((d) => d.id === 'pieges')!.cards;
    let state = createGame(BATTLEFIELD_15, { 1: traps, 2: traps }, undefined, 'contestation');
    const cell = (pos: { row: number; col: number }) => `${pos.row},${pos.col}`;
    // Pour chaque monstre, la case que son dernier déplacement a quittée ; une attaque ou un effet entre deux remet à zéro
    // (avancer, frapper puis revenir est permis).
    const left = new Map<string, string>();
    let backAndForth = 0;
    while (state.turn <= 10 && state.winner === null) {
      const action = chooseAction(state, state.activePlayer);
      if (action.type === 'move') {
        if (left.get(action.unitId) === cell(action.to)) backAndForth++;
        left.set(action.unitId, cell(state.units[action.unitId]!.pos));
      } else left.clear();
      state = applyAction(state, action);
    }
    expect(backAndForth).toBe(0);
  }, 60_000);

  it('Emma vaut la meilleure de ses formes : se transformer ne coûte que son mana', () => {
    const emma = gameWith([{ monster: 'emma', owner: 1, at: at(1, 1) }], { players: { 1: { mana: 2, grimoire: [] } } });
    const bat = applyAction(emma, { type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u1' } });
    expect(bat.units.u1?.cardId).toBe('emma-chauve-souris');
    expect(evaluate(bat, 1)).toBeGreaterThan(evaluate(emma, 1) - 1);
  });
});

describe('IA : riposte adverse', () => {
  it('la riposte est comptée à part du budget de recherche, et se coupe avec `reply: 0`', () => {
    const state = gameWith(
      [
        { monster: 'chevalier', owner: 1, at: at(5, 4) },
        { monster: 'chevalier', owner: 2, at: at(5, 6) },
      ],
      { players: { 1: { mana: 3, grimoire: [] } } },
    );
    chooseAction(state, 1, { ...SEARCH, reply: 0 });
    const without = lastEvaluations();
    chooseAction(state, 1, { ...SEARCH, reply: 4 });
    expect(lastEvaluations()).toBeGreaterThan(without);
  });
});

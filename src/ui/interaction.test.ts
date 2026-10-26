import { describe, expect, it } from 'vitest';
import { getPlayerView } from '../engine';
import type { GameState } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import {
  NO_SELECTION,
  clickCard,
  clickCell,
  contextCard,
  contextCell,
  getAreaDirections,
  getAttackPreviews,
  getEffectActions,
  getEnemyReach,
  getHighlights,
  getReach,
  getPathPreview,
  getPushChoices,
  isExhausted,
  isFocused,
  posKey,
} from './interaction';

const activeView = (state: GameState) => getPlayerView(state, state.activePlayer);
const MANA = { players: { 1: { mana: 10 } } };

describe('interaction : monstres (SPEC.md §7)', () => {
  const duel = () =>
    activeView(
      gameWith([
        { monster: 'chevalier', owner: 1, at: at(8, 1) }, // u1 : ATK 3
        { monster: 'golem', owner: 2, at: at(8, 2) }, // u2 : PV 7, survit
        { monster: 'eclaireur', owner: 2, at: at(7, 1) }, // u3 : PV 1, détruit au contact
      ]),
    );

  it('cliquer un de ses monstres le sélectionne ; ses déplacements et cibles sont en surbrillance', () => {
    const view = duel();
    const result = clickCell(view, NO_SELECTION, at(8, 1));
    expect(result).toEqual({ selection: { kind: 'unit', unitId: 'u1', mode: 'act' } });
    if (!('selection' in result)) throw new Error('sélection attendue');
    const highlights = getHighlights(view, result.selection);
    expect(highlights.get(posKey(at(9, 1)))).toBe('move');
    expect(highlights.get(posKey(at(8, 2)))).toBe('attack');
    expect(highlights.get(posKey(at(7, 1)))).toBe('attack');
    expect(highlights.has(posKey(at(8, 1)))).toBe(false);
  });

  it('cliquer une case atteignable joue le déplacement', () => {
    const selection = { kind: 'unit', unitId: 'u1', mode: 'act' } as const;
    expect(clickCell(duel(), selection, at(9, 1))).toEqual({ action: { type: 'move', unitId: 'u1', to: at(9, 1) } });
  });

  it('cliquer une cible à portée ouvre la bulle d’action, sans attaquer (lot 11)', () => {
    const view = duel();
    const selection = { kind: 'unit', unitId: 'u1', mode: 'act' } as const;
    expect(clickCell(view, selection, at(8, 2))).toEqual({ selection: { kind: 'attack', unitId: 'u1', targetId: 'u2', page: 'main' } });
    expect(clickCell(view, selection, at(7, 1))).toEqual({ selection: { kind: 'attack', unitId: 'u1', targetId: 'u3', page: 'main' } });
  });

  it('bulle ouverte : le plateau ne déplace ni ne sélectionne rien ; une autre cible y déplace la bulle', () => {
    const view = duel();
    const bubble = { kind: 'attack', unitId: 'u1', targetId: 'u2', page: 'main' } as const;
    expect(clickCell(view, bubble, at(9, 1))).toEqual({ selection: NO_SELECTION });
    expect(clickCell(view, bubble, at(8, 1))).toEqual({ selection: NO_SELECTION });
    expect(clickCell(view, { ...bubble, page: 'effects' }, at(7, 1))).toEqual({
      selection: { kind: 'attack', unitId: 'u1', targetId: 'u3', page: 'main' },
    });
    expect(clickCell(view, bubble, at(8, 2))).toEqual({ selection: NO_SELECTION });
    // Seule la cible est marquée ; le reste du plateau est atténué.
    expect([...getHighlights(view, bubble)]).toEqual([[posKey(at(8, 2)), 'attack']]);
    expect([...getAttackPreviews(view, bubble).keys()]).toEqual([posKey(at(8, 2))]);
    expect(isFocused(bubble)).toBe(true);
  });

  it('clic droit sur une carte de son grimoire : sa bulle ; la bulle ouverte, le plateau la ferme', () => {
    const view = activeView(gameWith([], MANA));
    expect(contextCard(view, 'milicien')).toEqual({ kind: 'cardMenu', cardId: 'milicien' });
    expect(contextCard(view, 'dragon-feu')).toEqual(NO_SELECTION);
    expect(clickCell(view, { kind: 'cardMenu', cardId: 'milicien' }, at(0, 4))).toEqual({ selection: NO_SELECTION });
  });

  it('clic droit : sur un de ses monstres, la bulle de ses effets ; ailleurs, il ferme la bulle', () => {
    const view = duel();
    expect(contextCell(view, NO_SELECTION, at(8, 1))).toEqual({ kind: 'effects', unitId: 'u1', page: 'effects' });
    const bubble = { kind: 'effects', unitId: 'u1', page: 'effects' } as const;
    expect(contextCell(view, bubble, at(8, 2))).toEqual(NO_SELECTION);
    expect(contextCell(view, bubble, at(1, 1))).toEqual(NO_SELECTION);
    const unit = { kind: 'unit', unitId: 'u1', mode: 'act' } as const;
    expect(contextCell(view, unit, at(1, 1))).toEqual(unit);
    // Hors de son tour : rien.
    expect(contextCell(getPlayerView(gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }]), 2), NO_SELECTION, at(8, 1))).toEqual(
      NO_SELECTION,
    );
  });

  it('cliquer une unité adverse l’affiche pour information ; cliquer une case vide désélectionne', () => {
    const view = duel();
    expect(clickCell(view, NO_SELECTION, at(8, 2))).toEqual({ selection: { kind: 'inspect', unitId: 'u2' } });
    expect(clickCell(view, { kind: 'unit', unitId: 'u1', mode: 'act' }, at(1, 1))).toEqual({ selection: NO_SELECTION });
  });

  it('recliquer le monstre sélectionné le désélectionne', () => {
    expect(clickCell(duel(), { kind: 'unit', unitId: 'u1', mode: 'act' }, at(8, 1))).toEqual({ selection: NO_SELECTION });
  });

  it('mode effet : seules les cibles de l’effet activé sont proposées', () => {
    const view = activeView(
      gameWith(
        [
          { monster: 'chaman', owner: 1, at: at(8, 1) },
          { monster: 'milicien', owner: 1, at: at(8, 2), hp: 1 },
        ],
        MANA,
      ),
    );
    const selection = { kind: 'unit', unitId: 'u1', mode: 'effect' } as const;
    expect([...getHighlights(view, selection)]).toEqual([[posKey(at(8, 2)), 'effect']]);
    expect(clickCell(view, selection, at(8, 2))).toEqual({
      action: { type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u2' } },
    });
  });

  it('hors de son tour, on ne peut que consulter les unités', () => {
    const state = gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }]);
    const view = getPlayerView(state, 2);
    expect(clickCell(view, NO_SELECTION, at(8, 1))).toEqual({ selection: { kind: 'inspect', unitId: 'u1' } });
  });
});

describe('interaction : cartes (SPEC.md §7)', () => {
  it('sélectionner une carte met ses cibles en surbrillance ; cliquer une cible la joue', () => {
    const view = activeView(gameWith([], MANA));
    const selection = clickCard(view, NO_SELECTION, 'milicien');
    expect(selection).toEqual({ kind: 'card', cardId: 'milicien' });
    expect([...getHighlights(view, selection).keys()]).toEqual(['0,3', '0,4', '0,5']);
    expect(clickCell(view, selection, at(0, 4))).toEqual({
      action: { type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos: at(0, 4) } },
    });
  });

  it('une carte non jouable ne se sélectionne pas ; recliquer une carte la désélectionne', () => {
    const view = activeView(gameWith([], { players: { 1: { mana: 1 } } }));
    expect(clickCard(view, NO_SELECTION, 'golem')).toEqual(NO_SELECTION);
    expect(clickCard(view, { kind: 'card', cardId: 'eclaireur' }, 'eclaireur')).toEqual(NO_SELECTION);
  });

  it('Bourrasque : on choisit la cible, puis une des directions possibles', () => {
    const view = activeView(gameWith([{ monster: 'golem', owner: 2, at: at(9, 0) }], MANA));
    const result = clickCell(view, { kind: 'card', cardId: 'bourrasque' }, at(9, 0));
    expect(result).toEqual({ selection: { kind: 'push', cardId: 'bourrasque', unitId: 'u1' } });
    if (!('selection' in result)) throw new Error('sélection attendue');
    expect(getPushChoices(view, result.selection).map((c) => [c.direction, c.destination])).toEqual([
      ['up', at(7, 0)],
      ['right', at(9, 2)],
    ]);
  });
});

describe('interaction : pièges et chemin (SPEC.md §6 bis)', () => {
  it('mode effet du Poseur de piège : les 8 cases autour, libres, puis la pose', () => {
    const view = activeView(gameWith([{ monster: 'poseur-de-piege', owner: 1, at: at(8, 1) }], MANA));
    const selection = { kind: 'unit', unitId: 'u1', mode: 'effect' } as const;
    expect([...getHighlights(view, selection).keys()].sort()).toEqual(['7,0', '7,1', '7,2', '8,0', '8,2', '9,0', '9,1', '9,2']);
    expect(clickCell(view, selection, at(7, 1))).toEqual({
      action: { type: 'activateEffect', unitId: 'u1', target: { kind: 'cell', pos: at(7, 1) } },
    });
  });

  it('au survol d’une destination, le chemin que prendra le monstre', () => {
    const view = activeView(gameWith([{ monster: 'eclaireur', owner: 1, at: at(8, 1) }]));
    const selection = { kind: 'unit', unitId: 'u1', mode: 'act' } as const;
    const path = getPathPreview(view, selection, at(8, 3));
    expect(path).toHaveLength(2);
    expect(path.at(-1)).toEqual(at(8, 3));
    expect(getPathPreview(view, selection, at(1, 1))).toEqual([]); // hors de portée
  });
});

describe('interaction : portée des monstres adverses', () => {
  it('consulter un monstre adverse montre où il pourra aller (orange) et frapper (rouge) à son prochain tour', () => {
    // Le Chevalier de J2 a déjà bougé (mobilité 0) : on montre sa mobilité complète (3) du prochain tour.
    const view = activeView(
      gameWith([
        { monster: 'chevalier', owner: 2, at: at(1, 1), mobilityLeft: 0 },
        { monster: 'golem', owner: 1, at: at(1, 2) }, // un ennemi pour lui : il bloque
      ]),
    );
    const selection = clickCell(view, NO_SELECTION, at(1, 1));
    expect(selection).toEqual({ selection: { kind: 'inspect', unitId: 'u1' } });
    const { moves, strikes } = getEnemyReach(view, 'u1');
    expect(moves).toContainEqual(at(4, 1)); // 3 pas
    expect(strikes).not.toContainEqual(at(4, 1)); // déjà en orange
    expect(strikes).toContainEqual(at(5, 1)); // frappée depuis (4, 1)
    expect([...moves, ...strikes]).not.toContainEqual(at(6, 1)); // trop loin, même pour frapper
    expect(strikes).toContainEqual(at(1, 2)); // le Golem : il peut l'attaquer
    expect(strikes).toContainEqual(at(1, 3)); // frappée depuis (2, 3), à 3 pas en contournant
    expect(strikes).not.toContainEqual(at(1, 1)); // sa propre case
    expect(getReach(view, { kind: 'inspect', unitId: 'u1' }, null)).toEqual({ moves, strikes });
  });

  it('un slow réduit cette portée ; rien pour ses propres unités', () => {
    const view = activeView(
      gameWith([
        { monster: 'chevalier', owner: 2, at: at(8, 1), hasAttacked: true },
        { monster: 'milicien', owner: 1, at: at(1, 1) },
      ]),
    );
    const chilled = activeView({
      ...gameWith([{ monster: 'chevalier', owner: 2, at: at(8, 1) }]),
    });
    const all = (v: typeof view) => [...getEnemyReach(v, 'u1').moves, ...getEnemyReach(v, 'u1').strikes];
    expect(all(view).length).toBeGreaterThan(0);
    expect(getEnemyReach(view, 'u2')).toEqual({ moves: [], strikes: [] });
    const slowed = { kind: 'slow', amount: 2, turns: 1, expiresAtTurn: 4 } as const;
    const frozen = { ...chilled, units: { u1: { ...chilled.units.u1!, statuses: [slowed] } } } as typeof chilled;
    // Slow 2 : 1 pas, puis une frappe de portée 1 → rien au-delà de 2 cases.
    const near = (p: { row: number; col: number }, d: number) => Math.abs(p.row - 8) + Math.abs(p.col - 1) <= d;
    expect(all(frozen).every((p) => near(p, 2))).toBe(true);
    expect(getEnemyReach(frozen, 'u1').moves.every((p) => near(p, 1))).toBe(true);
    expect(all(chilled).some((p) => !near(p, 2))).toBe(true);
    const stunned = { ...slowed, kind: 'stun', amount: 0 } as const;
    const knocked = { ...chilled, units: { u1: { ...chilled.units.u1!, statuses: [stunned] } } } as typeof chilled;
    expect(getEnemyReach(knocked, 'u1')).toEqual({ moves: [], strikes: [] });
  });

  it('un archer menace aussi les cases à 2 de chaque case qu’il peut atteindre', () => {
    const view = activeView(gameWith([{ monster: 'archer', owner: 2, at: at(8, 1) }])); // mobilité 2, portée 2
    const { moves, strikes } = getEnemyReach(view, 'u1');
    expect(moves).toContainEqual(at(8, 3));
    expect(strikes).toContainEqual(at(8, 5)); // 2 pas jusqu'à (8, 3), puis tir à 2
    expect(strikes).not.toContainEqual(at(8, 6));
  });

  it('au survol d’un monstre adverse, sa portée, quelle que soit la sélection', () => {
    const view = activeView(
      gameWith([
        { monster: 'chevalier', owner: 2, at: at(8, 1) },
        { monster: 'milicien', owner: 1, at: at(1, 1) },
      ]),
    );
    const reach = getEnemyReach(view, 'u1');
    expect(getReach(view, NO_SELECTION, at(8, 1))).toEqual(reach);
    // Même en préparant le déplacement de son Milicien : ses déplacements restent proposés à côté.
    const moving = { kind: 'unit', unitId: 'u2', mode: 'act' } as const;
    expect(getReach(view, moving, at(8, 1))).toEqual(reach);
    expect(getHighlights(view, moving).size).toBeGreaterThan(0);
    expect(getReach(view, { kind: 'card', cardId: 'milicien' }, at(8, 1))).toEqual(reach);
    expect(getReach(view, NO_SELECTION, at(1, 1))).toEqual({ moves: [], strikes: [] }); // son propre monstre
    expect(getReach(view, moving, at(5, 5))).toEqual({ moves: [], strikes: [] }); // case vide
  });
});

describe('interaction : aperçus du plateau', () => {
  it('dégâts prévus sur chaque cible ; l’assassin de dos les triple', () => {
    const view = activeView(
      gameWith([
        { monster: 'clown-assassin', owner: 1, at: at(9, 2) }, // u1 : ATK 2, sous le golem
        { monster: 'golem', owner: 2, at: at(8, 2) }, // u2 : J2 regarde vers le haut, son dos est en bas
        { monster: 'eclaireur', owner: 2, at: at(9, 3) }, // u3 : regarde vers le haut, attaqué de côté
      ]),
    );
    const previews = getAttackPreviews(view, { kind: 'unit', unitId: 'u1', mode: 'act' });
    expect(previews.get(posKey(at(8, 2)))).toEqual({ damage: 6, behind: true });
    expect(previews.get(posKey(at(9, 3)))).toEqual({ damage: 2, behind: false });
  });

  it('un monstre sans plus aucune action est épuisé ; un monstre adverse ne l’est jamais', () => {
    const view = activeView(
      gameWith([
        { monster: 'chevalier', owner: 1, at: at(8, 1), mobilityLeft: 0, hasAttacked: true },
        { monster: 'chevalier', owner: 1, at: at(8, 3) },
        { monster: 'golem', owner: 2, at: at(2, 2) },
      ]),
    );
    expect(isExhausted(view, 'u1')).toBe(true);
    expect(isExhausted(view, 'u2')).toBe(false);
    expect(isExhausted(view, 'u3')).toBe(false);
  });
});

describe('interaction : dragons (évolution, effets de zone)', () => {
  it('évolution : un choix par dragon du grimoire, rien à cliquer sur le plateau', () => {
    const view = activeView(
      gameWith([{ monster: 'jeune-dragon', owner: 1, at: at(5, 3) }], {
        turn: 3,
        players: { 1: { mana: 10, grimoire: ['dragon-feu', 'dragon-eau'] } },
      }),
    );
    const effectMode = { kind: 'unit', unitId: 'u1', mode: 'effect' } as const;
    expect(getEffectActions(view, 'u1').map((a) => a.target)).toEqual([
      { kind: 'card', cardId: 'dragon-feu' },
      { kind: 'card', cardId: 'dragon-eau' },
    ]);
    expect(getHighlights(view, effectMode).size).toBe(0);
  });

  it('effet de zone : la zone en violet ; un clic dessus le lance (sauf Vent violent, qui demande la distance)', () => {
    const state = (cardId: 'dragon-feu' | 'dragon-vent') =>
      activeView(
        gameWith(
          [
            { monster: cardId, owner: 1, at: at(8, 2), facing: 'down' },
            { monster: 'golem', owner: 2, at: at(9, 2) },
          ],
          MANA,
        ),
      );
    const fire = state('dragon-feu');
    const effectMode = { kind: 'unit', unitId: 'u1', mode: 'effect' } as const;
    expect([...getHighlights(fire, effectMode).entries()].filter(([, h]) => h === 'effect').length).toBe(3);
    expect(clickCell(fire, effectMode, at(9, 1))).toEqual({
      action: { type: 'activateEffect', unitId: 'u1', target: { kind: 'area' } },
    });
    // Vent violent : la ligne cliquée donne la direction ; reste la distance, dans la bulle.
    expect(clickCell(state('dragon-vent'), effectMode, at(9, 2))).toEqual({
      selection: { kind: 'areaDirection', unitId: 'u1', direction: 'down' },
    });
  });

  it('zone en ligne : les lignes de chaque direction utile en violet ; un clic choisit la direction de sa ligne', () => {
    const view = activeView(
      gameWith(
        [
          { monster: 'dragon-eau', owner: 1, at: at(8, 2), facing: 'up' },
          { monster: 'golem', owner: 2, at: at(8, 4) },
          { monster: 'milicien', owner: 2, at: at(9, 2) }, // vers le bas, la ligne s'arrête au bord du plateau
        ],
        MANA,
      ),
    );
    const effectMode = { kind: 'unit', unitId: 'u1', mode: 'effect' } as const;
    expect(getAreaDirections(view, 'u1')).toEqual(['down', 'right']);
    const violet = [...getHighlights(view, effectMode).entries()].filter(([, h]) => h === 'effect').map(([key]) => key);
    expect(violet.sort()).toEqual(['8,3', '8,4', '8,5', '9,2']);
    expect(clickCell(view, effectMode, at(8, 5))).toEqual({
      action: { type: 'activateEffect', unitId: 'u1', target: { kind: 'area', direction: 'right' } },
    });
    expect(clickCell(view, effectMode, at(9, 2))).toEqual({
      action: { type: 'activateEffect', unitId: 'u1', target: { kind: 'area', direction: 'down' } },
    });

    const wind = activeView(
      gameWith(
        [
          { monster: 'dragon-vent', owner: 1, at: at(8, 2), facing: 'up' },
          { monster: 'golem', owner: 2, at: at(8, 4) },
        ],
        MANA,
      ),
    );
    const picked = { kind: 'areaDirection', unitId: 'u1', direction: 'right' } as const;
    expect([...getHighlights(wind, picked).keys()].sort()).toEqual(['8,3', '8,4', '8,5']);
    expect(isFocused(picked)).toBe(true);
  });
});

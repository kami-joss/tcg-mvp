import { describe, expect, it } from 'vitest';
import { getPlayerView } from '../engine';
import type { GameState, Position } from '../engine';
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
  NO_ZONE_VIEW,
  getHighlights,
  getZoneView,
  getPathPreview,
  getPushChoices,
  isExhausted,
  isFocused,
  posKey,
} from './interaction';
import { getDangerZone, getUnitZones } from './zones';

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

describe('interaction : zones de mes monstres (handoff « zones »)', () => {
  it('à mon tour : aller = ses déplacements légaux ; survolé sans sélection, ses zones, sans danger', () => {
    const view = activeView(
      gameWith([
        { monster: 'chevalier', owner: 1, at: at(8, 4) },
        { monster: 'milicien', owner: 1, at: at(8, 8), mobilityLeft: 0, hasAttacked: true },
      ]),
    );
    const legal = view.legalActions.filter((a) => a.type === 'move' && a.unitId === 'u1').map((a) => (a as { to: Position }).to);
    const zones = getZoneView(view, NO_SELECTION, at(8, 4));
    expect(zones.unitId).toBe('u1');
    expect([...zones.moves].sort()).toEqual([...new Set(legal.map(posKey))].sort());
    expect(zones.moves.has('8,7')).toBe(true);
    expect(zones.danger.size).toBe(0);
    // Fini : ni aller, ni attaquer.
    const done = getZoneView(view, NO_SELECTION, at(8, 8));
    expect(done.moves.size + done.attacks.size).toBe(0);
  });

  it('sélectionné : ses zones et le danger adverse ; le survol d’un autre monstre n’y change rien', () => {
    const view = activeView(
      gameWith([
        { monster: 'chevalier', owner: 1, at: at(8, 4) },
        { monster: 'milicien', owner: 2, at: at(1, 1) },
      ]),
    );
    const selected = { kind: 'unit', unitId: 'u1', mode: 'act' } as const;
    const zones = getZoneView(view, selected, at(1, 1));
    expect(zones.unitId).toBe('u1');
    expect([...zones.danger.keys()].sort()).toEqual(getDangerZone(view, 1).map(posKey).sort());
    expect(zones.danger.size).toBeGreaterThan(0);
    expect(getZoneView(view, selected, null, false).danger.size).toBe(0); // « Menace ennemie » masquée
    // Un effet en préparation : ses cibles, pas de zones.
    expect(getZoneView(view, { ...selected, mode: 'effect' }, null)).toBe(NO_ZONE_VIEW);
  });
});

describe('interaction : zones des monstres adverses', () => {
  it('consulter un monstre adverse montre où il pourra aller (cyan) et attaquer (orange) à son prochain tour', () => {
    // Le Chevalier de J2 a déjà bougé (mobilité 0) : on montre sa mobilité complète (3) du prochain tour.
    const view = activeView(
      gameWith([
        { monster: 'chevalier', owner: 2, at: at(1, 1), mobilityLeft: 0 },
        { monster: 'golem', owner: 1, at: at(1, 2) }, // un ennemi pour lui : il bloque
      ]),
    );
    const selection = clickCell(view, NO_SELECTION, at(1, 1));
    expect(selection).toEqual({ selection: { kind: 'inspect', unitId: 'u1' } });
    const { moves, attacks } = getUnitZones(view, 'u1');
    expect(moves).toContainEqual(at(4, 1)); // 3 pas
    expect(attacks).not.toContainEqual(at(4, 1)); // déjà en cyan
    expect(attacks).toContainEqual(at(5, 1)); // frappée depuis (4, 1)
    expect([...moves, ...attacks]).not.toContainEqual(at(6, 1)); // trop loin, même pour frapper
    expect(attacks).toContainEqual(at(1, 2)); // le Golem : il peut l'attaquer
    expect(attacks).toContainEqual(at(1, 3)); // frappée depuis (2, 3), à 3 pas en contournant
    expect(attacks).not.toContainEqual(at(1, 1)); // sa propre case
    const shown = getZoneView(view, { kind: 'inspect', unitId: 'u1' }, null);
    expect([...shown.moves].sort()).toEqual(moves.map(posKey).sort());
    expect([...shown.targets]).toEqual(['1,2']); // le Golem, ennemi visible : en rouge
    // Vu de lui, le danger, ce sont mes monstres.
    expect([...shown.danger.keys()].sort()).toEqual(getDangerZone(view, 2).map(posKey).sort());
  });

  it('un slow réduit ses zones ; un stun les efface', () => {
    const chilled = activeView(gameWith([{ monster: 'chevalier', owner: 2, at: at(8, 1) }]));
    const all = (v: typeof chilled) => [...getUnitZones(v, 'u1').moves, ...getUnitZones(v, 'u1').attacks];
    const slowed = { kind: 'slow', amount: 2, turns: 1, expiresAtTurn: 4 } as const;
    const frozen = { ...chilled, units: { u1: { ...chilled.units.u1!, statuses: [slowed] } } } as typeof chilled;
    // Slow 2 : 1 pas, puis une frappe de portée 1 → rien au-delà de 2 cases.
    const near = (p: { row: number; col: number }, d: number) => Math.abs(p.row - 8) + Math.abs(p.col - 1) <= d;
    expect(all(frozen).every((p) => near(p, 2))).toBe(true);
    expect(getUnitZones(frozen, 'u1').moves.every((p) => near(p, 1))).toBe(true);
    expect(all(chilled).some((p) => !near(p, 2))).toBe(true);
    const stunned = { ...slowed, kind: 'stun', amount: 0 } as const;
    const knocked = { ...chilled, units: { u1: { ...chilled.units.u1!, statuses: [stunned] } } } as typeof chilled;
    expect(getUnitZones(knocked, 'u1')).toEqual({ moves: [], attacks: [] });
  });

  it('un archer menace aussi les cases à 2 de chaque case qu’il peut atteindre', () => {
    const view = activeView(gameWith([{ monster: 'archer', owner: 2, at: at(8, 1) }])); // mobilité 2, portée 2
    const { moves, attacks } = getUnitZones(view, 'u1');
    expect(moves).toContainEqual(at(8, 3));
    expect(attacks).toContainEqual(at(8, 5)); // 2 pas jusqu'à (8, 3), puis tir à 2
    expect(attacks).not.toContainEqual(at(8, 6));
  });

  it('au survol d’un monstre adverse, ses zones, sauf si un de mes monstres est sélectionné', () => {
    const view = activeView(
      gameWith([
        { monster: 'chevalier', owner: 2, at: at(8, 1) },
        { monster: 'milicien', owner: 1, at: at(1, 1) },
      ]),
    );
    const enemy = getUnitZones(view, 'u1');
    const hovered = getZoneView(view, NO_SELECTION, at(8, 1));
    expect(hovered.unitId).toBe('u1');
    expect([...hovered.moves].sort()).toEqual(enemy.moves.map(posKey).sort());
    expect(getZoneView(view, { kind: 'card', cardId: 'milicien' }, at(8, 1)).unitId).toBe('u1');
    // En préparant le déplacement de son Milicien : ses zones à lui, l'ennemi est dans le danger.
    const moving = { kind: 'unit', unitId: 'u2', mode: 'act' } as const;
    expect(getZoneView(view, moving, at(8, 1)).unitId).toBe('u2');
    expect(getHighlights(view, moving).size).toBeGreaterThan(0);
    expect(getZoneView(view, NO_SELECTION, at(5, 5))).toBe(NO_ZONE_VIEW); // case vide
  });
});

describe('interaction : aperçus du plateau', () => {
  it('dégâts prévus sur chaque cible ; l’assassin de dos les triple', () => {
    const view = activeView(
      gameWith([
        { monster: 'clown-assassin', owner: 1, at: at(9, 2) }, // u1 : ATK 3, sous le golem
        { monster: 'golem', owner: 2, at: at(8, 2) }, // u2 : J2 regarde vers le haut, son dos est en bas
        { monster: 'eclaireur', owner: 2, at: at(9, 3) }, // u3 : regarde vers le haut, attaqué de côté
      ]),
    );
    const previews = getAttackPreviews(view, { kind: 'unit', unitId: 'u1', mode: 'act' });
    expect(previews.get(posKey(at(8, 2)))).toEqual({ damage: 9, behind: true });
    expect(previews.get(posKey(at(9, 3)))).toEqual({ damage: 3, behind: false });
  });

  it('un monstre sans plus aucune action a fini son tour ; un monstre adverse jamais', () => {
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

  it('effet de zone : la zone en violet ; un clic dessus le lance (en ligne, avec la direction de la ligne cliquée)', () => {
    const state = (cardId: 'dragon-terre' | 'dragon-vent') =>
      activeView(
        gameWith(
          [
            { monster: cardId, owner: 1, at: at(8, 2), facing: 'down' },
            { monster: 'golem', owner: 2, at: at(9, 2) },
          ],
          MANA,
        ),
      );
    // Séisme : le carré de 2 de (8, 2), coupé par le bord du plateau et la case X (7, 4) : 8 + 11 cases.
    const earth = state('dragon-terre');
    const effectMode = { kind: 'unit', unitId: 'u1', mode: 'effect' } as const;
    expect([...getHighlights(earth, effectMode).entries()].filter(([, h]) => h === 'effect').length).toBe(19);
    expect(clickCell(earth, effectMode, at(10, 4))).toEqual({
      action: { type: 'activateEffect', unitId: 'u1', target: { kind: 'area' } },
    });
    // Tempête : pas de distance à choisir (recul de 2 vers l'avant), la ligne cliquée donne la direction et le lance.
    expect(clickCell(state('dragon-vent'), effectMode, at(9, 2))).toEqual({
      action: { type: 'activateEffect', unitId: 'u1', target: { kind: 'area', direction: 'down' } },
    });
  });

  it('zone en ligne : les zones de chaque direction utile en violet ; un clic choisit la direction de sa ligne', () => {
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
    // Vers le bas : (9, 2) et ses diagonales (9, 1), (9, 3) ; vers la droite : (8, 3) à (8, 5) et les diagonales (7, 3), (9, 3).
    const violet = [...getHighlights(view, effectMode).entries()].filter(([, h]) => h === 'effect').map(([key]) => key);
    expect(violet.sort()).toEqual(['7,3', '8,3', '8,4', '8,5', '9,1', '9,2', '9,3']);
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
    expect([...getHighlights(wind, picked).keys()].sort()).toEqual(['7,3', '8,3', '8,4', '8,5', '9,3']);
    expect(isFocused(picked)).toBe(true);
  });
});

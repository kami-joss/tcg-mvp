import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyAction, getCard, getPlayerView } from '../engine';
import type { Action, GameState, PlayerView } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { CARD_ART } from './art';
import { Board } from './Board';
import { ALL_TOKEN_STATS } from './settings';
import { describeCard, statusText } from './cardText';
import { applyEvent } from './fx/patch';
import { clickCell, getAttackPreviews, getHighlights, posKey } from './interaction';
import type { Selection } from './interaction';
import { describeAction } from './log';
import { eventSounds } from './sfx/events';
import { getSheet } from './sheet';

// Interface du deck Bodybuilder (SPEC.md §6 bis) : textes, Dopage, ATK effective (auras, bonus du tour), requiem.

const END_TURN: Action = { type: 'endTurn' };
const DOPAGE: Action = { type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u1' } };
const INJECT: Action = { type: 'playCard', cardId: 'seringue', target: { kind: 'unit', unitId: 'u1' } };
const activeView = (state: GameState) => getPlayerView(state, state.activePlayer);
const logOf = (state: GameState, action: Action) =>
  describeAction(activeView(state), action, getPlayerView(applyAction(state, action), state.activePlayer));
const renderBoard = (view: PlayerView) =>
  renderToStaticMarkup(
    <Board
      view={view}
      highlights={new Map()}
      attacks={new Map()}
      selectedUnitId={null}
      focused={false}
      path={[]}
      reach={new Map()}
      showArt
      mode="tilt"
      zoom={1}
      animated={false}
      flipped={false}
      stats={ALL_TOKEN_STATS}
      onCellClick={() => {}}
      onCellHover={() => {}}
    />,
  );
const cellSheet = (state: GameState, row: number, col: number) => getSheet(activeView(state), { kind: 'cell', pos: at(row, col) })!;

describe('textes des cartes Bodybuilder', () => {
  it('famille, passifs expliqués, effet sur lui-même, requiem', () => {
    expect(describeCard(getCard('arnold'))).toEqual([
      'ATK 7 · PV 5 · Mob. 3 · Portée 1',
      'Famille Bodybuilder.',
      'Passif · Aura · bodybuilders alliés adjacents · +2 ATK : sur les 8 cases autour de lui, pas lui-même ; plusieurs auras se cumulent.',
    ]);
    expect(describeCard(getCard('jeune-gomuscu'))[2]).toBe(
      'Passif · Quand il détruit une unité · +1 ATK +1 PV (définitivement) : chaque fois que son attaque détruit un monstre ou un terrain.',
    );
    expect(describeCard(getCard('jean-bon'))[2]).toBe(
      'Actif (2 mana) · Dopage · lui-même · +2 ATK (pour ce tour) + burn 1 pendant 2 tours',
    );
    expect(describeCard(getCard('seringue'))).toEqual(['Un allié bodybuilder · ATK ×2 (pour ce tour) + requiem 2']);
    expect(statusText({ kind: 'requiem', turns: 2 })).toBe('requiem 2');
    // L'évolution reste écrite seule.
    expect(describeCard(getCard('jeune-dragon')).at(-1)).toBe('Actif (2 mana) · Évolution');
  });

  it('fiche d’une carte du grimoire : type, passifs', () => {
    const sheet = getSheet(activeView(gameWith([])), { kind: 'card', cardId: 'ki-ne' })!;
    expect(sheet.type).toBe('Carte monstre · Bodybuilder');
    expect(sheet.passive?.items).toEqual([
      {
        name: 'Début de tour',
        text: 'Bodybuilders alliés adjacents · soin 1 : au début de chacun de vos tours, après les revenus et le burn, sans dépasser leurs PV max.',
      },
    ]);
  });

  it('les cinq cartes ont leur illustration', () => {
    for (const id of ['jeune-gomuscu', 'jean-bon', 'arnold', 'ki-ne', 'seringue'] as const) expect(CARD_ART[id], id).toBeTruthy();
  });
});

describe('Dopage (Jean Bon) : un clic sur lui-même', () => {
  const state = gameWith(
    [
      { monster: 'jean-bon', owner: 1, at: at(8, 1) },
      { monster: 'golem', owner: 2, at: at(8, 2), hp: 9 },
    ],
    { players: { 1: { mana: 2 } } },
  );
  const view = activeView(state);
  const effect: Selection = { kind: 'unit', unitId: 'u1', mode: 'effect' };

  it('sa case est en violet ; un clic dessus lance Dopage', () => {
    expect(getHighlights(view, effect).get(posKey(at(8, 1)))).toBe('effect');
    expect(clickCell(view, effect, at(8, 1))).toEqual({ action: DOPAGE });
  });

  it('journal, animation et son', () => {
    expect(logOf(state, DOPAGE)).toEqual(['Jean Bon de J1 utilise Dopage.', 'Jean Bon de J1 : +2 ATK ce tour.']);
    const after = getPlayerView(applyAction(state, DOPAGE), 1);
    const boost = after.events.find((e) => e.type === 'boost')!;
    expect(applyEvent(view, boost, after).units.u1).toMatchObject({ atk: 5, atkBonus: 2 });
    expect(eventSounds([boost]).map(([sound]) => sound)).toEqual(['charge']);
  });

  it('jeton, fiche et dégâts annoncés comptent le bonus', () => {
    const doped = applyAction(state, DOPAGE);
    const view = activeView(doped);
    expect(renderBoard(view)).toMatch(/class="stat stat--atk is-boosted" title="ATK 7 \(5 \+ 2\)">.*?<\/svg>7<\/span>/);
    const sheet = cellSheet(doped, 8, 1);
    expect(sheet.stats[0]).toEqual({ icon: 'broadsword', label: 'ATK', value: '7', delta: 2, hurt: false });
    expect(sheet.status).toContainEqual({ icon: 'broadsword', text: '+2 ATK jusqu’à la fin du tour', kind: 'boost' });
    expect(getAttackPreviews(view, { kind: 'unit', unitId: 'u1', mode: 'act' }).get(posKey(at(8, 2)))?.damage).toBe(7);
  });
});

describe('Arnold : l’aura se voit sur le jeton et dans la fiche', () => {
  const state = gameWith([
    { monster: 'arnold', owner: 1, at: at(8, 2) },
    { monster: 'jeune-gomuscu', owner: 1, at: at(8, 1) },
    { monster: 'golem', owner: 2, at: at(7, 1) },
  ]);

  it('Jeune Gomuscu frappe à 4 ; Arnold, lui, garde son ATK', () => {
    const view = activeView(state);
    const html = renderBoard(view);
    expect(html.match(/stat--atk is-boosted/g)).toHaveLength(1);
    const sheet = cellSheet(state, 8, 1);
    expect(sheet.type).toBe('Monstre · Bodybuilder · Joueur 1');
    expect(sheet.stats[0]).toMatchObject({ value: '4', delta: 2 });
    expect(sheet.status).toContainEqual({ icon: 'aura', text: '+2 ATK (aura : Arnold)', kind: 'boost' });
    expect(getAttackPreviews(view, { kind: 'unit', unitId: 'u2', mode: 'act' }).get(posKey(at(7, 1)))?.damage).toBe(4);
  });
});

describe('Seringue et requiem', () => {
  const state = gameWith(
    [
      { monster: 'jean-bon', owner: 1, at: at(2, 4) },
      { monster: 'eclaireur', owner: 2, at: at(9, 1) },
    ],
    { players: { 1: { mana: 5, grimoire: ['seringue', 'seringue'] } } },
  );
  const injected = applyAction(state, INJECT);

  it('journal : ATK doublée pour ce tour, requiem 2', () => {
    expect(logOf(state, INJECT)).toEqual([
      'J1 lance Seringue sur Jean Bon de J1.',
      'Jean Bon de J1 : +5 ATK ce tour.',
      'Jean Bon de J1 : requiem 2.',
    ]);
  });

  it('pastille tête de mort avec le compte à rebours, puce dans la fiche', () => {
    expect(renderBoard(activeView(injected))).toMatch(
      /class="status status--requiem" title="Requiem : meurt au début du 2e prochain tour de son camp">.*?<\/svg>2<\/span>/,
    );
    expect(cellSheet(injected, 2, 4).status).toContainEqual({
      icon: 'death-skull',
      text: 'Requiem : meurt au début de son 2e prochain tour, sans VP pour personne',
      kind: 'warn',
    });
    const later = applyAction(applyAction(injected, END_TURN), END_TURN);
    expect(renderBoard(activeView(later))).toMatch(/title="Requiem : meurt au début du prochain tour de son camp">.*?<\/svg>1<\/span>/);
    expect(cellSheet(later, 2, 4).status?.map((c) => c.text)).toContain(
      'Requiem : meurt au début de son prochain tour, sans VP pour personne',
    );
  });

  it('au terme : « succombe », animation et son de mort', () => {
    const before = applyAction(applyAction(applyAction(injected, END_TURN), END_TURN), END_TURN);
    expect(logOf(before, END_TURN)).toContain('Jean Bon de J1 succombe (requiem).');
    const after = getPlayerView(applyAction(before, END_TURN), 1);
    const requiem = after.events.find((e) => e.type === 'requiem')!;
    expect(applyEvent(getPlayerView(before, 1), requiem, after).units.u1).toBeUndefined();
    expect(eventSounds([requiem]).map(([sound]) => sound)).toEqual(['death']);
  });
});

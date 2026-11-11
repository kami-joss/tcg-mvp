import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView } from '../engine';
import type { GameState, PlayerId } from '../engine';
import { at, gameWith, withStatus } from '../engine/test-utils';
import { getUnitTip, readiness } from './unitTip';

const tip = (state: GameState, viewer: PlayerId, unitId: string) => getUnitTip(getPlayerView(state, viewer), unitId);
const lines = (state: GameState, viewer: PlayerId, unitId: string) =>
  tip(state, viewer, unitId)?.lines.map((l) => [l.label, l.status.text]);

describe('infobulle d’un jeton (option J du 2026-11-11)', () => {
  const state = gameWith([
    { monster: 'chevalier', owner: 1, at: at(8, 1), mobilityLeft: 1 },
    { monster: 'golem', owner: 2, at: at(8, 2), hp: 5 },
  ]);

  it('son propre monstre, à son tour : son nom, « ton tour », l’attaque disponible, ni statut ni effet', () => {
    expect(tip(state, 1, 'u1')).toEqual({
      title: 'Chevalier',
      owner: 1,
      when: 'ton tour',
      // Ses stats du moment, comme sur la fiche : pas restants sur le maximum de ce tour.
      stats: [
        { icon: 'broadsword', label: 'ATK', value: '3', delta: 0, hurt: false },
        { icon: 'hearts', label: 'PV', value: '4/4', delta: 0, hurt: false },
        { icon: 'walking-boot', label: 'Pas rest.', value: '1/3', delta: 0, hurt: false },
        { icon: 'high-shot', label: 'Portée', value: '1', delta: 0, hurt: false },
      ],
      lines: [{ icon: 'broadsword', label: 'Attaque', status: { text: 'Disponible', tone: 'ok' } }],
      chips: [],
    });
    expect(readiness(getPlayerView(state, 1), 'u1')).toEqual({ attack: true, effect: false });
  });

  it('attaque : utilisée ce tour, ou aucune cible depuis cette case ; plus rien à faire : pas de pastille', () => {
    const used = gameWith([
      { monster: 'chevalier', owner: 1, at: at(8, 1), hasAttacked: true },
      { monster: 'golem', owner: 2, at: at(8, 2) },
    ]);
    expect(lines(used, 1, 'u1')).toEqual([['Attaque', 'Utilisée ce tour']]);
    expect(readiness(getPlayerView(used, 1), 'u1')).toBeNull();
    const alone = gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }]);
    expect(lines(alone, 1, 'u1')).toEqual([['Attaque', 'Aucune cible depuis cette case']]);
  });

  it('monstre adverse : sa menace au prochain tour, jamais de pastille', () => {
    expect(tip(state, 1, 'u2')).toMatchObject({ title: 'Golem', owner: 2, when: 'adversaire' });
    expect(lines(state, 1, 'u2')).toEqual([['Menace', 'Prochain tour : mobilité 2, portée 1']]);
    expect(tip(state, 1, 'u2')?.stats).toContainEqual({ icon: 'hearts', label: 'PV', value: '5/7', delta: 0, hurt: true });
    expect(readiness(getPlayerView(state, 1), 'u2')).toBeNull();
  });

  it('son monstre pendant le tour adverse : ni attaque ni effet, pas de pastille', () => {
    expect(tip(state, 2, 'u2')).toMatchObject({ when: 'tour adverse', lines: [] });
    expect(readiness(getPlayerView(state, 2), 'u2')).toBeNull();
  });

  it('effet actif : son état (mana manquant) ; la riposte, prête ou utilisée', () => {
    const poor = gameWith([{ monster: 'invocateur', owner: 1, at: at(5, 4) }], { players: { 1: { mana: 0 } } });
    expect(lines(poor, 1, 'u1')).toContainEqual(['Effet actif', 'Mana insuffisant · il te manque 1']);
    const guard = gameWith([{ monster: 'gardien', owner: 1, at: at(8, 1) }]);
    expect(lines(guard, 1, 'u1')).toContainEqual(['Riposte', 'Prête']);
    const riposted = gameWith([{ monster: 'gardien', owner: 1, at: at(8, 1), hasRiposted: true }]);
    expect(lines(riposted, 2, 'u1')).toContainEqual(['Riposte', 'Utilisée ce tour']);
  });

  it('statuts : ce qu’il leur reste à durer, en tours de l’unité touchée ; couleur selon leur cause', () => {
    const burning = withStatus(withStatus(state, 'u2', 'burn', 1, 2), 'u2', 'immobilise', 0, 0);
    expect(tip(burning, 1, 'u2')?.chips).toEqual(
      expect.arrayContaining([
        { icon: 'flame', text: 'Burn 1', detail: 'Burn 1 : perd 1 PV au début de chacun de ses tours pendant ses 2 prochains tours', kind: 'burn', group: 'status', turns: 2 },
        { icon: 'walking-boot', text: 'Immobilisé', detail: 'Immobilisé : ne peut plus se déplacer jusqu’à son prochain tour', kind: 'warn', group: 'status', turns: 0 },
      ]),
    );
  });

  it('slow reçu pendant son tour et Charge : en statut et en effet en cours', () => {
    const slowed = withStatus(gameWith([{ monster: 'golem', owner: 1, at: at(8, 1) }]), 'u1', 'slow', 1, 1);
    expect(tip(slowed, 1, 'u1')?.chips.map((c) => [c.text, c.detail])).toContainEqual(['Slow 1', 'Slow 1 : −1 mobilité jusqu’à la fin de ce tour et de son prochain']);
    const charged = applyAction(gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], { players: { 1: { mana: 3, grimoire: ['charge'] } } }), {
      type: 'playCard',
      cardId: 'charge',
      target: { kind: 'unit', unitId: 'u1' },
    });
    expect(tip(charged, 1, 'u1')?.chips).toContainEqual({ icon: 'sprint', text: 'Charge', detail: '+2 mobilité ce tour', kind: 'boost', group: 'effect' });
  });

  it('un terrain : la mana zone qu’il tient et le monstre posé dessus ; jamais de pastille', () => {
    const held = gameWith([{ terrain: 'bastion', owner: 1, at: at(5, 4) }, { monster: 'golem', owner: 1, at: at(5, 4) }]);
    expect(tip(held, 1, 'u1')).toMatchObject({ title: 'Bastion', lines: [] });
    expect(tip(held, 1, 'u1')?.stats.map((s) => s.label)).toEqual(['PV']);
    expect(tip(held, 1, 'u1')?.chips.map((c) => c.text)).toEqual(['Forge', 'Golem']);
    expect(readiness(getPlayerView(held, 1), 'u1')).toBeNull();
    expect(tip(held, 1, 'u9')).toBeNull();
  });
});

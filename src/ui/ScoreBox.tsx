// Score d'un joueur dans l'encoche du haut (refonte du 2026-11-11) : l'orbe de mana (`ManaOrb`), le nom et le deck
// (avec « À toi », ou « Joue » pour l'IA ou l'adversaire en ligne, au joueur qui joue), dessous ses compteurs « Plateau »
// et « Cimetière » qui ouvrent ces listes (SPEC.md §10, `CardPiles`), puis ses VP, côté centre, et une barre de
// progression vers la victoire. J1 toujours à gauche de « Fin du tour », J2 à droite en miroir ; le joueur qui ne joue
// pas est terni. Le mana porte `data-mana` et les VP `data-vp` : les animations y font voler les gains. Mana dépensé :
// des éclats cyan et de la brume s'échappent de l'orbe ; points gagnés : des étincelles dorées jaillissent des VP.
import { useEffect, useRef, useState } from 'react';
import { getManaLimit } from '../engine';
import type { PlayerId, PlayerView } from '../engine';
import { PileCounters } from './CardPiles';
import { ManaOrb, orbBurst } from './ManaOrb';
import type { PileKind } from './piles';

/** Valeur affichée qui rattrape la valeur réelle en 650 ms (ease-out), pour les compteurs de mana et de VP. */
export function useTween(value: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const current = useRef(value);
  useEffect(() => {
    from.current = current.current;
    if (from.current === value) return;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 650);
      const eased = 1 - Math.pow(1 - k, 3);
      const next = Math.round(from.current + (value - from.current) * eased);
      current.current = next;
      setShown(next);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

interface ScoreBoxProps {
  view: PlayerView;
  player: PlayerId;
  deckName: string;
  /** Ce joueur est joué par l'IA. */
  ai?: boolean;
  /** Animations permises (réglage, et pas de « mouvements réduits » demandés par le système). */
  animated?: boolean;
  /** Sa liste ouverte dans le panneau « Sur le plateau » et cimetière, s'il y en a une. */
  pile: PileKind | null;
  /** Clic sur un de ses compteurs. */
  onPile: (pile: PileKind) => void;
}

export function ScoreBox({ view, player, deckName, ai = false, animated = true, pile, onPile }: ScoreBoxProps) {
  const mine = player === view.viewer;
  const real = mine ? view.me : view.opponent;
  const mana = useTween(real.mana);
  const vp = useTween(real.vp);
  const cards = mine ? view.me.grimoire.length : view.opponent.grimoireCount;
  const active = player === view.activePlayer;
  // Limite du mana de la partie (réglée à l'accueil) : l'orbe est pleine à cette valeur.
  const limit = getManaLimit(view);

  // Mana qui baisse, VP qui montent : un éclat, une fois par changement (pas au premier affichage). Il part à l'image
  // suivante : quand une animation d'action reprend aussitôt l'écran d'avant (`GameScreen`), la valeur revient avant
  // et l'éclat est annulé ; il partira quand l'animation montrera vraiment la dépense.
  const root = useRef<HTMLElement>(null);
  const previous = useRef({ mana: real.mana, vp: real.vp });
  useEffect(() => {
    const before = previous.current;
    previous.current = { mana: real.mana, vp: real.vp };
    const el = root.current;
    const spent = real.mana < before.mana;
    const gained = real.vp > before.vp;
    if (!animated || !el || !(spent || gained)) return;
    const frame = requestAnimationFrame(() => {
      const burst = el.querySelector<HTMLElement>('[data-burst]');
      const spark = el.querySelector<HTMLElement>('[data-spark]');
      if (spent && burst) orbBurst(burst, 'mana');
      if (gained && spark) orbBurst(spark, 'vp');
    });
    return () => cancelAnimationFrame(frame);
  }, [real.mana, real.vp, animated]);

  return (
    <section
      ref={root}
      className={`score score--p${player}${active ? ' is-active' : ''}`}
      aria-label={`Joueur ${player}`}
      title={`Deck ${deckName} · ${cards} cartes ${mine ? 'en grimoire' : 'restantes'} · ${view.economy === 'reserve' ? 'réserve de mana' : 'mana'} : ${real.mana} / ${limit}`}
    >
      <ManaOrb player={player} mana={mana} active={active} animated={animated} limit={limit} />
      <div className="score__text">
        <div className="score__name">
          <strong>
            Joueur {player}
            {ai && ' · IA'}
          </strong>
          <span className="score__deck">{deckName}</span>
          {active && view.winner === null && <span className="score__tag">{mine ? 'À toi' : 'Joue'}</span>}
        </div>
        <PileCounters view={view} player={player} open={pile} onOpen={onPile} />
      </div>
      <div className="score__vp">
        <span data-vp={player}>{vp}</span>
        <small>/{view.victoryVp} VP</small>
        <span className="score__spark" data-spark={player} />
      </div>
      <span className="score__progress" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (real.vp / Math.max(1, view.victoryVp)) * 100)}%` }} />
      </span>
    </section>
  );
}

// Encart d'un joueur (SPEC.md §7) : nom, VP sur 20, deck, cartes restantes et mana. Celui du joueur qui regarde est
// sous son grimoire (en bas à droite), celui de l'adversaire au-dessus de la fiche (en haut à gauche). Les compteurs
// portent `data-vp` et `data-mana` : les animations y font voler les gains.
import { useEffect, useRef, useState } from 'react';
import { VICTORY_VP } from '../engine';
import type { PlayerId, PlayerView } from '../engine';
import { Icon } from './Icon';

/** Valeur affichée qui rattrape la valeur réelle en 650 ms (ease-out), pour les compteurs de mana et de VP. */
function useTween(value: number): number {
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

export function PlayerBox({ view, player, deckName, ai = false }: { view: PlayerView; player: PlayerId; deckName: string; ai?: boolean }) {
  const mine = player === view.viewer;
  const real = mine ? view.me : view.opponent;
  const mana = useTween(real.mana);
  const vp = useTween(real.vp);
  const cards = mine ? view.me.grimoire.length : view.opponent.grimoireCount;
  const active = player === view.activePlayer;
  return (
    <section className={`player player--p${player}${active ? ' is-active' : ''}`} aria-label={`Joueur ${player}`}>
      <span className={`shape shape--p${player}`} />
      <div className="player__main">
        <div className="player__line">
          <h2 className="player__name">
            Joueur {player}
            {ai && ' · IA'}
          </h2>
          {active && <span className="player__tag">{mine ? 'À toi de jouer' : 'Joue…'}</span>}
          <span className="player__vp" data-vp={player}>
            <Icon name="laurels" />
            {vp}
            <small>/ {VICTORY_VP} VP</small>
          </span>
        </div>
        <div className="vp-bar">
          <span style={{ width: `${Math.min(100, (vp / VICTORY_VP) * 100)}%` }} />
        </div>
        <p className="player__meta">
          Deck {deckName} · {cards} cartes {mine ? 'en grimoire' : 'restantes'}
        </p>
      </div>
      <div className="player__mana" data-mana={player}>
        <strong>{mana}</strong>
        <span>
          <Icon name="crystal-growth" />
          mana
        </span>
      </div>
    </section>
  );
}

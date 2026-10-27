// Score d'un joueur dans la barre du haut (handoff V11, lot 12 §1 et §3) : l'orbe de mana (`ManaOrb`), puis le nom, le
// deck et les VP. J1 toujours à gauche de « Fin du tour », J2 à droite en miroir ; le joueur qui ne joue pas est un peu
// terni. Le mana porte `data-mana` et les VP `data-vp` : les animations y font voler les gains. Mana dépensé : des
// éclats cyan et de la brume s'échappent de l'orbe ; points gagnés : des étincelles dorées jaillissent des VP.
import { useEffect, useRef, useState } from 'react';
import { VICTORY_VP } from '../engine';
import type { PlayerId, PlayerView } from '../engine';
import { ManaOrb, orbBurst } from './ManaOrb';

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
}

export function ScoreBox({ view, player, deckName, ai = false, animated = true }: ScoreBoxProps) {
  const mine = player === view.viewer;
  const real = mine ? view.me : view.opponent;
  const mana = useTween(real.mana);
  const vp = useTween(real.vp);
  const cards = mine ? view.me.grimoire.length : view.opponent.grimoireCount;
  const active = player === view.activePlayer;

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
      title={`Deck ${deckName} · ${cards} cartes ${mine ? 'en grimoire' : 'restantes'}`}
    >
      <ManaOrb player={player} mana={mana} active={active} animated={animated} />
      <div className="score__text">
        <div className="score__name">
          <strong>
            Joueur {player}
            {ai && ' · IA'}
          </strong>
          <span className="score__deck">{deckName}</span>
        </div>
        <div className="score__vp">
          <span data-vp={player}>{vp}</span>
          <small>/{VICTORY_VP} VP</small>
          <span className="score__spark" data-spark={player} />
        </div>
      </div>
    </section>
  );
}

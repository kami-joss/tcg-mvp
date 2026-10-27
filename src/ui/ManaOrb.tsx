// Orbe de mana du score (handoff V11, lot 12 §3, option 2a de « Scores ») : une sphère de verre où le liquide monte avec
// le mana, avec une vague, des bulles, un halo qui respire pour le joueur qui joue et de la brume qui s'en échappe. Le
// chiffre au centre porte `data-mana` : les gains de mana y volent (fx). Animations coupées : l'orbe reste lisible,
// sans vague, bulles, brume ni halo animé, et `orbBurst` ne lâche rien.
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { PlayerId } from '../engine';

/**
 * Mana pour lequel l'orbe est pleine. Le moteur n'a pas de plafond de mana (SPEC.md §4.10 : il est conservé d'un tour
 * à l'autre) : l'orbe est pleine à 10, comme dans la maquette ; au-delà, seul le chiffre monte.
 */
export const ORB_FULL_MANA = 10;

/** Hasard à graine fixe : bulles et bouffées de brume tirées une fois par joueur, toujours aux mêmes places. */
function seeded(seed: number): (min: number, max: number) => number {
  let t = seed;
  return (min, max) => {
    t = (t * 9301 + 49297) % 233280;
    return min + (t / 233280) * (max - min);
  };
}

interface Puff {
  readonly style: CSSProperties;
}

/** Les 5 bouffées de brume puis les 5 bulles d'un joueur (même tirage que la maquette). */
function orbDecor(player: PlayerId): { mist: readonly Puff[]; bubbles: readonly Puff[] } {
  const r = seeded(player * 97 + 13);
  const mist = Array.from({ length: 5 }, () => {
    const w = r(12, 20);
    const left = r(12, 42);
    const dx = r(-14, 14);
    const duration = r(2.4, 4);
    const delay = r(0, 4);
    return {
      style: {
        left: `${left.toFixed(1)}px`,
        width: `${w.toFixed(1)}px`,
        height: `${w.toFixed(1)}px`,
        marginLeft: `${(-w / 2).toFixed(1)}px`,
        marginTop: `${(-w / 2).toFixed(1)}px`,
        '--dx': `${dx.toFixed(1)}px`,
        animationDuration: `${duration.toFixed(2)}s`,
        animationDelay: `${(-delay).toFixed(2)}s`,
      } as CSSProperties,
    };
  });
  const bubbles = Array.from({ length: 5 }, () => {
    const w = r(2, 4);
    const left = r(8, 24);
    const duration = r(1.6, 3);
    const delay = r(0, 3);
    return {
      style: {
        left: `${left.toFixed(1)}px`,
        width: `${w.toFixed(1)}px`,
        height: `${w.toFixed(1)}px`,
        animationDuration: `${duration.toFixed(2)}s`,
        animationDelay: `${(-delay).toFixed(2)}s`,
      } as CSSProperties,
    };
  });
  return { mist, bubbles };
}

interface ManaOrbProps {
  player: PlayerId;
  /** Mana affiché (déjà adouci par le compteur). */
  mana: number;
  /** C'est à ce joueur de jouer : halo qui respire, brume plus dense. */
  active: boolean;
  animated: boolean;
}

export function ManaOrb({ player, mana, active, animated }: ManaOrbProps) {
  const { mist, bubbles } = useMemo(() => orbDecor(player), [player]);
  const level = Math.min(100, (Math.max(0, mana) / ORB_FULL_MANA) * 100);
  const mistOpacity = mana > 0 ? (active ? 0.75 : 0.22) : 0;
  return (
    <div className={`orb${animated ? ' orb--anim' : ''}${active ? ' is-active' : ''}`}>
      <div className="orb__glow" />
      <div className="orb__glass">
        <div className="orb__liquid" style={{ height: `${level.toFixed(1)}%` }}>
          <div className="orb__wave" />
        </div>
        {animated &&
          mana > 0 &&
          bubbles.map((bubble, i) => <span key={i} className="orb__bubble" style={bubble.style} />)}
        <div className="orb__shine" />
      </div>
      {animated && (
        <div className="orb__mist" style={{ '--o': mistOpacity } as CSSProperties}>
          {mist.map((puff, i) => (
            <span key={i} className="orb__puff" style={puff.style} />
          ))}
        </div>
      )}
      <div className="orb__value" data-mana={player}>
        {mana}
      </div>
      <div className="orb__burst" data-burst={player} />
    </div>
  );
}

/**
 * Éclats sur le score (WAAPI, retirés à la fin) : `mana` dépensé, 14 particules cyan lancées vers le haut depuis le
 * haut de l'orbe et 3 bouffées de brume ; `vp` gagnés, 12 étincelles dorées dans toutes les directions.
 */
export function orbBurst(el: HTMLElement, kind: 'mana' | 'vp'): void {
  const mana = kind === 'mana';
  const count = mana ? 14 : 12;
  for (let i = 0; i < count; i++) {
    const spark = document.createElement('span');
    const angle = mana ? ((-90 + (Math.random() - 0.5) * 120) * Math.PI) / 180 : Math.random() * Math.PI * 2;
    const distance = (mana ? 20 : 14) + Math.random() * (mana ? 28 : 22);
    const size = mana ? 3 + Math.random() * 3.5 : 2 + Math.random() * 3;
    const color = mana ? 'oklch(0.84 0.13 225)' : 'oklch(0.92 0.14 88)';
    spark.className = 'orb-spark';
    spark.style.cssText = `left:${-size / 2}px; top:${-size / 2}px; width:${size}px; height:${size}px; border-radius:${mana ? '50%' : '1px'}; background:${color}; box-shadow:0 0 6px 1px ${color};`;
    el.appendChild(spark);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance - (mana ? 12 : 0);
    const animation = spark.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${mana ? 0 : 180}deg) scale(.3)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.3,1)' },
    );
    animation.onfinish = () => spark.remove();
  }
  if (!mana) return;
  for (let i = 0; i < 3; i++) {
    const puff = document.createElement('span');
    const w = 14 + Math.random() * 8;
    puff.className = 'orb-spark orb-spark--mist';
    puff.style.cssText = `left:${-w / 2}px; top:${-w / 2}px; width:${w}px; height:${w}px;`;
    el.appendChild(puff);
    const animation = puff.animate(
      [
        { transform: 'translate(0, 0) scale(.6)', opacity: 0.8 },
        { transform: `translate(${((Math.random() - 0.5) * 24).toFixed(1)}px, -34px) scale(2)`, opacity: 0 },
      ],
      { duration: 1200, delay: i * 90, easing: 'ease-out', fill: 'backwards' },
    );
    animation.onfinish = () => puff.remove();
  }
}

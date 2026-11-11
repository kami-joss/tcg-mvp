// Infobulle d'un jeton au survol (option J de la refonte de la fiche, validée le 2026-11-11) : l'état de l'unité dans la
// partie, que la fiche ne montre plus. En tête, son nom et le moment (« ton tour », « adversaire ») ; ses stats du
// moment, comme sur la fiche (2026-11-12) ; puis ce qu'il peut
// encore faire ce tour (attaque, chaque effet actif, riposte) ou sa menace ; ses statuts en pastilles avec les tours
// qu'il leur reste ; enfin les effets en cours, chacun sur une ligne (bonus du tour, aura, zone tenue…). Elle ne prend
// pas la souris : posée à droite de la case survolée (à gauche si elle n'y tient pas), dans la fenêtre. Le contenu
// vient de `unitTip.ts`.
import type { CSSProperties } from 'react';
import { Icon } from './Icon';
import type { SheetChip } from './sheet';
import type { UnitTip } from './unitTip';

/** Largeur de l'infobulle (px). */
export const TIP_WIDTH = 260;
/** Écart entre la case et l'infobulle, et marge au bord de la fenêtre. */
const TIP_GAP = 10;

/** Les tours qu'il reste à un statut, en court : « 2 tours » ; 0 : il tombe au début de son prochain tour. */
export function turnsShort(turns: number): string {
  return turns === 0 ? 'jusqu’à son tour' : `${turns} tour${turns > 1 ? 's' : ''}`;
}

/**
 * Place de l'infobulle pour une case à l'écran : à droite de la case, sinon à gauche ; le haut vers le haut du jeton
 * (debout au-dessus de sa case), sans sortir de la fenêtre.
 */
export function tipPosition(cell: { left: number; right: number; top: number; height: number }, viewport: { width: number; height: number }) {
  const right = cell.right + TIP_GAP;
  const left = right + TIP_WIDTH <= viewport.width - TIP_GAP ? right : Math.max(TIP_GAP, cell.left - TIP_GAP - TIP_WIDTH);
  const top = Math.min(Math.max(TIP_GAP, cell.top + cell.height / 2 - 72), Math.max(TIP_GAP, viewport.height - 220));
  return { left: Math.round(left), top: Math.round(top) };
}

function StatusPill({ chip }: { chip: SheetChip }) {
  return (
    <span className={`chip chip--${chip.kind}`}>
      <Icon name={chip.icon} />
      {chip.text}
      {chip.turns !== undefined && <small className="unit-tip__turns">{` · ${turnsShort(chip.turns)}`}</small>}
    </span>
  );
}

export function UnitTooltip({ tip, style }: { tip: UnitTip; style?: CSSProperties }) {
  const statuses = tip.chips.filter((chip) => chip.group === 'status');
  const effects = tip.chips.filter((chip) => chip.group === 'effect');
  return (
    <div className="unit-tip" role="tooltip" style={{ width: TIP_WIDTH, ...style }}>
      <p className="unit-tip__head">
        <span className={`unit-tip__dot unit-tip__dot--p${tip.owner}`} />
        <b>{tip.title}</b>
        <span className="unit-tip__when">{tip.when}</span>
      </p>
      {tip.stats.length > 0 && (
        <div className="unit-tip__stats">
          {tip.stats.map((stat) => (
            <div key={stat.label} className={`unit-tip__stat sheet__stat--${stat.icon}${stat.hurt ? ' is-hurt' : ''}`}>
              <span className="unit-tip__stat-value">
                <Icon name={stat.icon} />
                <strong>{stat.value}</strong>
                {stat.delta !== 0 && (
                  <em className={`sheet__delta ${stat.delta > 0 ? 'is-up' : 'is-down'}`}>
                    {stat.delta > 0 ? `+${stat.delta}` : `−${-stat.delta}`}
                  </em>
                )}
              </span>
              <span className="unit-tip__stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      )}
      {tip.lines.map((line) => (
        <p key={line.label} className={`unit-tip__line unit-tip__line--${line.icon}`}>
          <Icon name={line.icon} />
          <b>{line.label}</b>
          <span className={`unit-tip__state tone--${line.status.tone}`}>
            <span className="tone__dot" />
            {line.status.text}
          </span>
        </p>
      ))}
      {statuses.length > 0 && (
        <div className="unit-tip__chips">
          {statuses.map((chip, i) => (
            <StatusPill key={`${i}-${chip.text}`} chip={chip} />
          ))}
        </div>
      )}
      {effects.length > 0 && (
        <div className="unit-tip__effects">
          {effects.map((chip, i) => (
            <p key={`${i}-${chip.text}`} className={`unit-tip__effect chip--${chip.kind}`}>
              <Icon name={chip.icon} />
              <span>
                {/* Le nom, s'il n'est pas déjà dans la phrase (« Tient Forge : … »). */}
                {!chip.detail.includes(chip.text) && (
                  <>
                    <b>{chip.text}</b> ·{' '}
                  </>
                )}
                {chip.detail}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

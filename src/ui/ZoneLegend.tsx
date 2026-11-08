// Légende des zones (handoff « zones », SPEC.md §10) : panneau en bas à gauche du plateau, quand un monstre est
// sélectionné. Trois lignes (aller, attaquer, danger), le cas superposé, le texte d'aide au survol d'une case de
// danger, et deux boutons : « Menace ennemie » (le contour violet) et « Chemin au survol » (les points du chemin).
import type { CSSProperties } from 'react';

export const DANGER_HINT = 'Zone de danger : un ennemi peut vous atteindre ici.';

export function ZoneLegend({
  danger,
  path,
  hint,
  onToggleDanger,
  onTogglePath,
  style,
}: {
  /** Bouton « Menace ennemie » enfoncé : le danger s'affiche. */
  danger: boolean;
  /** Bouton « Chemin au survol » enfoncé. */
  path: boolean;
  /** La souris est sur une case de danger. */
  hint: boolean;
  onToggleDanger: () => void;
  onTogglePath: () => void;
  style?: CSSProperties;
}) {
  return (
    <section className="zone-legend panel" aria-label="Légende des zones" style={style}>
      <p className="zone-legend__row">
        <span className="zone-legend__sw zone-legend__sw--move" /> Là où je peux aller
      </p>
      <p className="zone-legend__row">
        <span className="zone-legend__sw zone-legend__sw--attack" /> Là où je peux attaquer
      </p>
      <p className="zone-legend__row">
        <span className="zone-legend__sw zone-legend__sw--target" /> Ennemi que je peux attaquer
      </p>
      <p className="zone-legend__row">
        <span className="zone-legend__sw zone-legend__sw--mana" /> Mana zone dans ma zone (voile doré)
      </p>
      <p className="zone-legend__row">
        <span className="zone-legend__sw zone-legend__sw--danger" /> Zone de danger ennemie (aller ou taper)
      </p>
      <p className="zone-legend__note">
        {hint ? DANGER_HINT : 'Halo et contour violet ensemble : je peux y aller, mais je m’expose.'}
      </p>
      <div className="zone-legend__buttons">
        <button type="button" className={`zone-legend__button${danger ? ' is-on' : ''}`} aria-pressed={danger} onClick={onToggleDanger}>
          Menace ennemie
        </button>
        <button type="button" className={`zone-legend__button${path ? ' is-on' : ''}`} aria-pressed={path} onClick={onTogglePath}>
          Chemin au survol
        </button>
      </div>
    </section>
  );
}

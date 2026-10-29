// Roue des options de la barre du haut (handoff V11, lot 12 §2) : tous les réglages d'affichage dans un panneau ancré
// sous la roue, à droite. Vue, zoom, stats sur les jetons (lot 6), son et volume, animations, plateau tourné, puis
// « Nouvelle partie ». Un clic en dehors (calque transparent sous le panneau) ou Échap le referme.
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { ZOOMS, stepZoom } from './settings';
import type { BoardView, DisplaySettings, TokenStats } from './settings';

export const STAT_ROWS: readonly { key: keyof TokenStats; label: string; icon: IconName }[] = [
  { key: 'hp', label: 'PV', icon: 'hearts' },
  { key: 'mobility', label: 'Mobilité restante (mes monstres)', icon: 'walking-boot' },
  { key: 'enemyMobility', label: 'Mobilité (adversaire)', icon: 'walking-boot' },
  { key: 'atk', label: 'Attaque', icon: 'broadsword' },
  { key: 'statuses', label: 'Statuts (brûlure, givre…)', icon: 'flame' },
];

const VIEWS: [BoardView, string][] = [
  ['top', 'Dessus'],
  ['tilt', 'Inclinée 45°'],
  ['iso', 'Isométrique'],
];

interface OptionsMenuProps {
  settings: DisplaySettings;
  /** Vue affichée (l'isométrique se replie sur l'inclinée quand le plateau n'a pas de décor). */
  boardView: BoardView;
  isoAvailable: boolean;
  onChange: (patch: Partial<DisplaySettings>) => void;
  /** Son activé ou coupé (un petit son confirme l'activation). */
  onSound: (on: boolean) => void;
  /** Partie en cours : « Nouvelle partie » demande confirmation. */
  confirmHome: boolean;
  onHome: () => void;
  /** Ouvert d'emblée (tests). */
  initialOpen?: boolean;
}

export function OptionsMenu(props: OptionsMenuProps) {
  const { initialOpen = false } = props;
  const [open, setOpen] = useState(initialOpen);

  // Échap referme le panneau, et seulement lui (pas de désélection ni de fermeture de l'aide en même temps).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  return (
    <div className="options">
      {open && <div className="options__backdrop" onPointerDown={() => setOpen(false)} />}
      <button
        type="button"
        className="topbar__icon-btn options__toggle"
        aria-expanded={open}
        title="Options"
        onClick={() => setOpen(!open)}
      >
        <Icon name="cog" />
      </button>
      {open && <OptionsPanel {...props} />}
    </div>
  );
}

function OptionsPanel({ settings, boardView, isoAvailable, onChange, onSound, confirmHome, onHome }: OptionsMenuProps) {
  const [confirming, setConfirming] = useState(false);
  const { zoom, tokenStats: stats } = settings;
  const zoomIndex = ZOOMS.indexOf(zoom);
  return (
    <div className="options__panel" role="dialog" aria-label="Options">
      <section className="options__section">
        <h3 className="options__title">Vue</h3>
        <div className="view-switch" role="group" aria-label="Vue du plateau">
          {VIEWS.filter(([value]) => value !== 'iso' || isoAvailable).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={boardView === value} onClick={() => onChange({ view: value })}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="options__section options__section--row">
        <h3 className="options__title">Zoom</h3>
        <div className="view-switch zoom-switch" role="group" aria-label="Zoom du plateau">
          <button type="button" title="Dézoomer" disabled={zoomIndex <= 0} onClick={() => onChange({ zoom: stepZoom(zoom, -1) })}>
            −
          </button>
          <button type="button" className="zoom-switch__value" title="Revenir à la taille ajustée" onClick={() => onChange({ zoom: 1 })}>
            {Math.round(zoom * 100)} %
          </button>
          <button
            type="button"
            title="Zoomer"
            disabled={zoomIndex >= ZOOMS.length - 1}
            onClick={() => onChange({ zoom: stepZoom(zoom, 1) })}
          >
            +
          </button>
        </div>
      </section>

      <section className="options__section options__section--rule" role="group" aria-label="Stats sur les jetons">
        <h3 className="options__title">Stats sur les jetons</h3>
        {STAT_ROWS.map(({ key, label, icon }) => (
          <label key={key} className="options__check">
            <input type="checkbox" checked={stats[key]} onChange={() => onChange({ tokenStats: { ...stats, [key]: !stats[key] } })} />
            <span className={`options__check-icon options__check-icon--${key}`}>
              <Icon name={icon} />
            </span>
            {label}
          </label>
        ))}
        <p className="options__hint">Maintiens Alt pour tout afficher le temps d’un coup d’œil.</p>
      </section>

      <section className="options__section options__section--rule">
        <div className="options__sound">
          <button
            type="button"
            className="options__button"
            aria-pressed={settings.sound}
            title={settings.sound ? 'Couper le son' : 'Activer le son'}
            onClick={() => onSound(!settings.sound)}
          >
            <Icon name={settings.sound ? 'speaker' : 'speaker-off'} />
            Son
          </button>
          <input
            type="range"
            className="options__volume"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            disabled={!settings.sound}
            onChange={(event) => onChange({ volume: Number(event.target.value) })}
          />
        </div>
        <label className="options__check">
          <input type="checkbox" checked={settings.animations} onChange={(event) => onChange({ animations: event.target.checked })} />
          Animations
        </label>
      </section>

      <section className="options__section options__section--rule">
        {confirming ? (
          <div className="options__confirm">
            <span>Abandonner la partie en cours ?</span>
            <div className="options__confirm-buttons">
              <button type="button" className="btn btn--gold" onClick={onHome}>
                Oui, retour à l’accueil
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
                Non
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="options__button" onClick={() => (confirmHome ? setConfirming(true) : onHome())}>
            Nouvelle partie
          </button>
        )}
      </section>
    </div>
  );
}

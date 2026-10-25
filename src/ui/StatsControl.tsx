// Menu « Stats » de la barre du haut (handoff, lot 6) : le joueur choisit les pastilles affichées sur les jetons.
// Alt maintenu (ou le bouton œil maintenu, sur écran tactile) affiche tout le temps d'un coup d'œil.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import type { TokenStats } from './settings';

export const STAT_ROWS: readonly { key: keyof TokenStats; label: string; icon: IconName }[] = [
  { key: 'hp', label: 'PV', icon: 'hearts' },
  { key: 'mobility', label: 'Mobilité restante (mes monstres)', icon: 'walking-boot' },
  { key: 'enemyMobility', label: 'Mobilité (adversaire)', icon: 'walking-boot' },
  { key: 'atk', label: 'Attaque', icon: 'broadsword' },
  { key: 'statuses', label: 'Statuts (brûlure, givre…)', icon: 'flame' },
];

interface StatsControlProps {
  stats: TokenStats;
  onChange: (stats: TokenStats) => void;
  /** Alt ou le bouton œil est maintenu : toutes les stats sont affichées. */
  peek: boolean;
  onPeek: (on: boolean) => void;
  /** Ouvert d'emblée (tests). */
  initialOpen?: boolean;
}

export function StatsControl({ stats, onChange, peek, onPeek, initialOpen = false }: StatsControlProps) {
  const [open, setOpen] = useState(initialOpen);
  const root = useRef<HTMLDivElement>(null);

  // Un clic ailleurs ou Échap referme le menu.
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const release = () => onPeek(false);

  return (
    <div className="stats-control" ref={root}>
      <button
        type="button"
        className={`stats-toggle${peek ? ' is-peeking' : ''}`}
        aria-expanded={open}
        title="Choisir les stats affichées sur les jetons"
        onClick={() => setOpen(!open)}
      >
        <Icon name="eye" />
        Stats
      </button>
      <button
        type="button"
        className={`stats-peek${peek ? ' is-peeking' : ''}`}
        title="Maintenir pour tout afficher"
        aria-label="Maintenir pour afficher toutes les stats"
        onPointerDown={(event) => {
          event.preventDefault();
          onPeek(true);
        }}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onContextMenu={(event) => event.preventDefault()}
      >
        <Icon name="eye" />
      </button>
      {open && (
        <div className="stats-menu" role="group" aria-label="Stats sur les jetons">
          <div className="stats-menu__title">Stats sur les jetons</div>
          {STAT_ROWS.map(({ key, label, icon }) => (
            <label key={key} className="stats-menu__row">
              <input type="checkbox" checked={stats[key]} onChange={() => onChange({ ...stats, [key]: !stats[key] })} />
              <span className={`stats-menu__icon stats-menu__icon--${key}`}>
                <Icon name={icon} />
              </span>
              {label}
            </label>
          ))}
          <p className="stats-menu__hint">Maintenez Alt pour tout afficher le temps d’un coup d’œil.</p>
        </div>
      )}
    </div>
  );
}

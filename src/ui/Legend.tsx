// Aide, sous le plateau (la colonne centrale défile, le plateau ne rétrécit pas) : réglages, commandes, qui est qui,
// obstacles, icônes et surbrillances.
import { Icon } from './Icon';
import type { IconName } from './Icon';
import type { DisplaySettings } from './settings';

const ICONS: [IconName, string][] = [
  ['water-drop', 'Mana'],
  ['laurels', 'VP'],
  ['magic-swirl', 'Effet actif'],
  ['broadsword', 'ATK'],
  ['hearts', 'PV'],
  ['walking-boot', 'Mobilité'],
  ['high-shot', 'Portée'],
  ['dragon-head', 'Monstre'],
  ['spell-book', 'Sort'],
  ['castle', 'Terrain'],
];

interface LegendProps {
  settings: DisplaySettings;
  onChange: (patch: Partial<DisplaySettings>) => void;
  onClose: () => void;
}

export function Legend({ settings, onChange, onClose }: LegendProps) {
  return (
    <section className="legend" aria-label="Aide">
      <button type="button" className="legend__close" title="Fermer l’aide (Échap)" onClick={onClose}>
        ×
      </button>
      <div className="legend__group legend__settings">
        <h3>Réglages</h3>
        <label>
          <input type="checkbox" checked={settings.animations} onChange={(e) => onChange({ animations: e.target.checked })} />
          Animations
        </label>
        <label>
          <input type="checkbox" checked={settings.flip} onChange={(e) => onChange({ flip: e.target.checked })} />
          Plateau tourné vers le joueur qui joue
        </label>
        <label>
          <input type="checkbox" checked={settings.sound} onChange={(e) => onChange({ sound: e.target.checked })} />
          Son
        </label>
        <label className="legend__volume">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            disabled={!settings.sound}
            onChange={(e) => onChange({ volume: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="legend__group">
        <h3>Commandes</h3>
        <p>Clic sur ton monstre : ses déplacements (turquoise) et ses cibles (cadre blanc).</p>
        <p>Clic sur une cible : la bulle d’action (attaquer, attaquer et avancer, effets). Touches 1 à 9 pour choisir.</p>
        <p>Clic droit sur ton monstre : ses effets actifs.</p>
        <p>Clic droit sur une carte du grimoire : l’invoquer, la lancer ou la poser (ou un clic gauche, puis la case dorée).</p>
        <p>Échap : retour, ou annuler · Alt : toutes les stats.</p>
      </div>
      <div className="legend__group">
        <h3>Qui est qui</h3>
        <p>
          <span className="sw sw--drop sw--drop-p1" /> Joueur 1 · goutte bleue
        </p>
        <p>
          <span className="sw sw--drop sw--drop-p2" /> Joueur 2 · goutte rouge, liseré blanc
        </p>
        <p>
          <span className="sw sw--zone" /> Mana zone : +1 mana, +1 VP
        </p>
      </div>
      <div className="legend__group">
        <h3>Obstacles</h3>
        <p>
          <span className="sw sw--blocked" /> Case bloquée · coupe les tirs
        </p>
        <p>
          <span className="sw sw--cliff" /> Falaise · bloque tout
        </p>
        <p>
          <span className="sw sw--cliff-low" /> Falaise basse · tirs de portée 2+
        </p>
      </div>
      <div className="legend__group">
        <h3>Icônes</h3>
        <div className="legend__icons">
          {ICONS.map(([icon, label]) => (
            <span key={icon} className={`legend__icon legend__icon--${icon}`}>
              <Icon name={icon} />
              {label}
            </span>
          ))}
        </div>
        <p>
          <span className="sw sw--drop sw--drop-p1 sw--drop-right" /> Pointe = sens du regard (dos de l’autre côté)
        </p>
      </div>
      <div className="legend__group">
        <h3>Statuts</h3>
        <p>
          <span className="status status--stun legend__status">
            <Icon name="knockout" />
          </span>
          Stun · aucune action
        </p>
        <p>
          <span className="status status--slow legend__status">
            <Icon name="snail" />
          </span>
          Slow X · mobilité réduite de X
        </p>
        <p>
          <span className="status status--immobilise legend__status">
            <Icon name="fishing-net" />
          </span>
          Immobilisé · ne bouge plus, peut attaquer
        </p>
        <p>
          <span className="status status--burn legend__status">
            <Icon name="flame" />
          </span>
          Burn X · perd X PV chaque tour
        </p>
        <p>Effet actif : à activer, contre du mana · effet passif : toujours en place.</p>
      </div>
      <div className="legend__group">
        <h3>Surbrillances</h3>
        <p>
          <span className="sw sw--move" /> Se déplacer ici
        </p>
        <p>
          <span className="sw sw--attack" /> Attaquer · dégâts affichés
        </p>
        <p>
          <span className="sw sw--target" /> Jouer la carte · <span className="sw sw--effect" /> Effet
        </p>
        <p>
          <span className="sw sw--reach" /> Où l’ennemi survolé pourra aller
        </p>
        <p>
          <span className="sw sw--threat" /> Où il pourra frapper (tes monstres compris)
        </p>
      </div>
      <p className="legend__credit">
        Icônes : game-icons.net (Lorc, Delapouite & contributeurs), licence CC BY 3.0. Décors de la vue isométrique : Kenney
        « Isometric Nature » (CC0).
      </p>
    </section>
  );
}

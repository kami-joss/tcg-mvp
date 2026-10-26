// Fiche (handoff V8, lot 9), dans la colonne de gauche (jamais sur le plateau). Monstre, terrain ou carte : une carte
// de 280 × 498, l'illustration en fond cadrée sur les yeux et pleinement visible dans le bandeau du haut, le corps qui
// défile, « Effets en cours » en bas. Zone, piège ou case : la hauteur de son texte, sans illustration.
import type { CSSProperties } from 'react';
import { CARD_ART, SHEET_FRAME, artFit, fitBackground } from './art';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import type { SheetData, SheetStatus } from './sheet';

/** Largeur de la fiche, en px : le cadrage de l'illustration s'écrit en px. */
const SHEET_WIDTH = 280;

const KIND_ICONS: Readonly<Record<NonNullable<SheetData['kind']>, IconName>> = {
  monster: 'dragon-head',
  spell: 'spell-book',
  terrain: 'castle',
};

function Cost({ value, small = false }: { value: number; small?: boolean }) {
  return (
    <span className={`mana-pill${small ? ' mana-pill--small' : ''}`} title="Coût en mana">
      <Icon name="water-drop" />
      {value}
    </span>
  );
}

function Status({ status, className }: { status: SheetStatus; className: string }) {
  return (
    <span className={`${className} tone--${status.tone}`}>
      <span className="tone__dot" />
      {status.text}
    </span>
  );
}

/** Fond d'une fiche illustrée : flou (s'il reste du vide en bas), illustration, voile ; sans illustration, l'icône. */
function SheetBackground({ sheet }: { sheet: SheetData }) {
  const art = sheet.art && CARD_ART[sheet.art.cardId];
  if (!art) {
    const owner = sheet.art?.owner;
    return (
      <div className={`sheet__bg sheet__bg--plain${owner ? ` sheet__bg--p${owner}` : ''}`} aria-hidden="true">
        {sheet.kind && <Icon name={KIND_ICONS[sheet.kind]} />}
      </div>
    );
  }
  const fit = artFit(art, SHEET_FRAME);
  const gap = fit.edge < 99.5;
  const mask = gap ? `linear-gradient(180deg, #000 ${(fit.edge - 12).toFixed(1)}%, transparent ${fit.edge.toFixed(1)}%)` : undefined;
  const image: CSSProperties = { background: fitBackground(art, fit, SHEET_WIDTH), maskImage: mask, WebkitMaskImage: mask };
  return (
    <>
      {gap && <div className="sheet__bg sheet__bg--blur" style={{ backgroundImage: `url("${art.src}")` }} aria-hidden="true" />}
      <div className="sheet__bg" style={image} aria-hidden="true" />
      <div className="sheet__bg sheet__bg--veil" aria-hidden="true" />
    </>
  );
}

export function HoverSheet({ sheet }: { sheet: SheetData }) {
  const card = sheet.art !== null;
  const classes = ['sheet', `sheet--${sheet.frame}`, card && 'sheet--card', sheet.kind && `is-jewel jewel--${sheet.kind}`];
  return (
    <aside className={classes.filter(Boolean).join(' ')} aria-label={`Fiche : ${sheet.title}`}>
      {card && <SheetBackground sheet={sheet} />}
      {card && <div className="sheet__band">{sheet.cost !== null && <Cost value={sheet.cost} />}</div>}
      <div className="sheet__head">
        <h2 className="sheet__title">{sheet.title}</h2>
        {!card && sheet.cost !== null && <Cost value={sheet.cost} />}
      </div>
      <div className="sheet__body">
        <p className="sheet__type">
          {sheet.typeIcon && <Icon name={sheet.typeIcon} />}
          {sheet.type}
        </p>
        {sheet.stats.length > 0 && (
          <div className="sheet__stats">
            {sheet.stats.map((stat) => (
              <div
                key={stat.label}
                className={`sheet__stat${stat.delta > 0 ? ' is-up' : stat.delta < 0 ? ' is-down' : ''}${stat.hurt ? ' is-hurt' : ''}`}
              >
                <Icon name={stat.icon} />
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
                {stat.delta !== 0 && (
                  <em className="sheet__delta">{stat.delta > 0 ? `+${stat.delta}` : `−${-stat.delta}`}</em>
                )}
              </div>
            ))}
          </div>
        )}
        {sheet.lines.map((line) => (
          <div key={line.label} className="sheet__avail">
            <Icon name={line.icon} />
            <b>{line.label}</b>
            <Status status={line.status} className="sheet__state" />
          </div>
        ))}
        {sheet.text.map((line) => (
          <p key={line} className="sheet__line">
            {line}
          </p>
        ))}
        {sheet.passive && (
          <div className="sheet__block sheet__block--passive">
            <p className="sheet__block-head">
              <Icon name="aura" />
              <span>Effet passif</span>
            </p>
            {sheet.passive.items.map((item) => (
              <p key={`${item.name}-${item.text}`} className="sheet__line">
                {item.name && (
                  <>
                    <b>{item.name}</b> ·{' '}
                  </>
                )}
                {item.text}
              </p>
            ))}
            {sheet.passive.foot && <Status status={sheet.passive.foot} className="sheet__foot" />}
          </div>
        )}
        {sheet.active && (
          <div className="sheet__block sheet__block--active">
            <p className="sheet__block-head">
              <Icon name="magic-swirl" />
              <span>Effet actif{sheet.active.name && ` · ${sheet.active.name}`}</span>
              {sheet.active.cost !== null && <Cost value={sheet.active.cost} small />}
            </p>
            <p className="sheet__line">{sheet.active.text}</p>
            {sheet.active.foot && <Status status={sheet.active.foot} className="sheet__foot" />}
          </div>
        )}
      </div>
      {sheet.status && (
        <div className="sheet__status">
          <p className="sheet__status-head">Effets en cours</p>
          {sheet.status.length === 0 ? (
            <p className="sheet__none">Aucun</p>
          ) : (
            <div className="sheet__chips">
              {sheet.status.map((chip, i) => (
                <span key={`${i}-${chip.text}`} className={`chip chip--${chip.kind}`}>
                  <Icon name={chip.icon} />
                  {chip.text}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

/** Sans fiche : un cadre pointillé à sa place (masqué sur petit écran). */
export function SheetPlaceholder() {
  return (
    <div className="sheet-placeholder">
      Survole un monstre, un terrain, une mana zone ou une carte du grimoire pour afficher sa fiche ici.
    </div>
  );
}

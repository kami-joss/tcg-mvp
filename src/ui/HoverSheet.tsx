// Fiche (handoff V8, lot 9), dans la colonne de gauche (jamais sur le plateau). Monstre, terrain ou carte : une carte
// de 280 × 498, l'illustration en fond cadrée sur les yeux et pleinement visible dans le bandeau du haut, le corps qui
// défile, « Effets en cours » en bas. Zone, piège ou case : la hauteur de son texte, sans illustration.
// Overframe (handoff V11, lot 12 §4) : une carte qui a ses calques sort du cadre (`OverframeStage`), la hauteur du
// débordement réservée au-dessus de la fiche ; un clic l'ouvre en grand. Exemplaire brillant : cadre doré, badge
// « ★ Brillante », reflets (images brillantes de l'overframe, ou shiny générique sur l'illustration).
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { SHEET_FRAME, artFit, cardArtFor, fitBackground } from './art';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { OverframeStage, SHEET_H, ShinyLayers } from './Overframe';
import type { OverframeLayers } from './Overframe';
import { MAX_HEADROOM, OVERFRAMES } from './overframes';
import type { OverframeDef } from './overframes';
import type { SheetData, SheetStatus } from './sheet';
import { CardRules } from './CardRules';

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

/** Pied de fiche : les statuts, puis les autres effets qui touchent l'unité. */
const CHIP_GROUPS = [
  { group: 'status', title: 'Statuts' },
  { group: 'effect', title: 'Effets' },
] as const;

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
  const art = sheet.art && cardArtFor(sheet.art.cardId, sheet.shiny);
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

/** L'overframe de la carte de la fiche, s'il y en a une. */
export const sheetOverframe = (sheet: SheetData) => (sheet.art ? OVERFRAMES[sheet.art.cardId] : undefined);

/** Place gardée au journal sous une fiche à overframe : sa hauteur minimale et l'écart. */
const LOG_ROOM = 72 + 12;

/**
 * Échelle d'une fiche à overframe dans une colonne de `column` px de haut : 1 si elle tient avec son débordement, sinon
 * réduite pour laisser sa place au journal (fenêtre basse), 0,6 au moins.
 */
export function overframeFit(column: number, headroom: number): number {
  return Math.min(1, Math.max(0.6, (column - LOG_ROOM) / (SHEET_H + headroom)));
}

/**
 * Place de la fiche dans la colonne : le haut du cadre toujours au même endroit, sous la place du plus grand débordement
 * (`MAX_HEADROOM`), qu'elle ait une overframe ou non ; une overframe y loge le sien, les autres fiches laissent l'espace
 * vide (il laisse passer les clics). Fenêtre basse : toutes les fiches et cette place sont réduites du même facteur
 * `fit` (`zoom` posé par game.css), elles restent identiques.
 */
export function sheetPlacement(overframe: OverframeDef | undefined, fit: number): CSSProperties {
  const paddingTop = Number(((MAX_HEADROOM - (overframe?.headroom ?? 0)) * fit).toFixed(2));
  return { paddingTop, '--sheet-fit': fit } as CSSProperties;
}

interface HoverSheetProps {
  sheet: SheetData;
  /** Animations permises (réglage, mouvements réduits). */
  animated?: boolean;
  /** Clic sur une fiche à overframe : l'ouvrir en grand. */
  onOpen?: () => void;
}

export function HoverSheet({ sheet, animated = false, onOpen }: HoverSheetProps) {
  const overframe = sheetOverframe(sheet);
  if (!overframe) return <SheetFrame sheet={sheet} animated={animated} />;
  return (
    <OverframeStage
      def={overframe}
      shiny={sheet.shiny}
      animated={animated}
      onClick={onOpen}
      title={onOpen ? 'Voir la carte en grand' : undefined}
    >
      {(layers) => <SheetFrame sheet={sheet} animated={animated} layers={layers} />}
    </OverframeStage>
  );
}

function SheetFrame({ sheet, animated, layers }: { sheet: SheetData; animated: boolean; layers?: OverframeLayers }) {
  const card = sheet.art !== null;
  const classes = [
    'sheet',
    `sheet--${sheet.frame}`,
    card && 'sheet--card',
    sheet.kind && `is-jewel jewel--${sheet.kind}`,
    layers && 'sheet--of',
    sheet.shiny && 'sheet--shiny',
  ];
  return (
    <aside className={classes.filter(Boolean).join(' ')} aria-label={`Fiche : ${sheet.title}`}>
      {layers ? layers.back : card && <SheetBackground sheet={sheet} />}
      {!layers && card && sheet.shiny && <ShinyLayers animated={animated} />}
      {card && <div className="sheet__band">{sheet.cost !== null && <Cost value={sheet.cost} />}</div>}
      <div className="sheet__head">
        <h2 className="sheet__title">
          {sheet.title}
          {sheet.archetype && <small className="sheet__archetype">{sheet.archetype}</small>}
        </h2>
        {sheet.shiny && <span className="sheet__shiny">★ Brillante</span>}
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
        {sheet.flavor && <p className="sheet__flavor">{sheet.flavor}</p>}
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
                    <b>
                      <CardRules text={item.name} />
                    </b>{' '}
                    ·{' '}
                  </>
                )}
                <CardRules text={item.text} />
              </p>
            ))}
            {sheet.passive.foot && <Status status={sheet.passive.foot} className="sheet__foot" />}
          </div>
        )}
        {sheet.active.map((active, i) => (
          <div key={i} className="sheet__block sheet__block--active">
            <p className="sheet__block-head">
              <Icon name="magic-swirl" />
              <span>Effet actif{active.name && ` · ${active.name}`}</span>
              {active.cost !== null && <Cost value={active.cost} small />}
            </p>
            <p className="sheet__line">
              <CardRules text={active.text} />
            </p>
            {active.foot && <Status status={active.foot} className="sheet__foot" />}
          </div>
        ))}
      </div>
      {sheet.status && (
        <div className="sheet__status">
          {sheet.status.length === 0 ? (
            <div className="sheet__group">
              <p className="sheet__status-head">Statuts · Effets</p>
              <p className="sheet__none">Aucun</p>
            </div>
          ) : (
            // Un groupe vide ne prend pas de place : la fiche garde la hauteur pour le texte de la carte.
            CHIP_GROUPS.map(({ group, title }) => {
              const chips = sheet.status!.filter((chip) => chip.group === group);
              if (chips.length === 0) return null;
              return (
                <div key={group} className={`sheet__group sheet__group--${group}`}>
                  <p className="sheet__status-head">{title}</p>
                  <div className="sheet__chips">
                    {chips.map((chip, i) => (
                      <span key={`${i}-${chip.text}`} className={`chip chip--${chip.kind}`} title={chip.detail}>
                        <Icon name={chip.icon} />
                        {chip.text}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
      {layers?.glare}
    </aside>
  );
}

/**
 * Aperçu plein écran d'une fiche à overframe (§6.3 du handoff overframe) : rendu complet avec le débordement, centré,
 * à l'échelle min(1,8 ; (hauteur de la fenêtre − 80) / (498 + débordement)), sur un fond assombri et flouté. Échap
 * (géré par l'écran de jeu) ou un clic sur le fond le referme. Pas d'animation d'ouverture.
 */
export function SheetPreview({ sheet, animated, onClose }: { sheet: SheetData; animated: boolean; onClose: () => void }) {
  const overframe = sheetOverframe(sheet);
  const [height, setHeight] = useState(() => (typeof window === 'undefined' ? 900 : window.innerHeight));
  useEffect(() => {
    const resize = () => setHeight(window.innerHeight);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const scale = Math.min(1.8, (height - 80) / (SHEET_H + (overframe?.headroom ?? 0)));
  return (
    <div className="sheet-preview" role="dialog" aria-label={`Carte : ${sheet.title}`}>
      <div className="sheet-preview__backdrop" title="Fermer (Échap)" onClick={onClose} />
      <div className="sheet-preview__card" style={{ transform: `translate(-50%, -50%) scale(${scale.toFixed(3)})` }}>
        <HoverSheet sheet={sheet} animated={animated} />
      </div>
    </div>
  );
}

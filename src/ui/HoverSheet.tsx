// Fiche (handoff V8, lot 9), dans la colonne de gauche (jamais sur le plateau). Monstre, terrain ou carte : une carte
// de 280 × 498 « plein cadre » (refonte du 2026-11-11, piste E) : l'illustration sur toute la carte, sans fondu ; le coût
// dans un rond bleu en haut à droite, comme dans le grimoire ; en bas, le nom et l'archétype posés sur le dessin, puis
// des blocs de verre à peine flouté (stats en 4 colonnes, effet passif en ambre, un bloc par effet actif en violet, avec
// son coût). La carte ne dit que ce qu'elle fait : l'état de l'unité (disponibilité, statuts, effets en cours) est au
// jeton (`unitTip.ts`). Zone, piège ou case : la hauteur de son texte, sans illustration.
// Taille de la fiche (`SHEET_SCALE`, posée en `--sheet-k`) : elle agrandit le cadre, l'illustration et l'overframe
// (calques `.sheet__scale`, dans le repère 280 × 498) ; le texte garde sa taille et sa place, tout le gain de hauteur va
// au bandeau de l'illustration.
// Overframe (handoff V11, lot 12 §4) : une carte qui a ses calques sort du cadre (`OverframeStage`), la hauteur du
// débordement réservée au-dessus de la fiche ; un clic l'ouvre en grand. Exemplaire brillant : cadre doré, badge
// « ★ Brillante », reflets (images brillantes de l'overframe, ou shiny générique sur l'illustration).
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Position } from '../engine';
import { SHEET_FRAME, artFit, cardArtFor, fitBackground } from './art';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { OverframeStage, SHEET_H, ShinyLayers } from './Overframe';
import type { OverframeLayers } from './Overframe';
import { MAX_HEADROOM, OVERFRAMES } from './overframes';
import type { OverframeDef } from './overframes';
import type { SheetActive, SheetData, SheetStatus } from './sheet';
import { CardRules } from './CardRules';

/** Largeur de la fiche, en px : le cadrage de l'illustration s'écrit en px. */
const SHEET_WIDTH = 280;

/**
 * Taille de la fiche de la colonne et de son aperçu, par rapport au repère 280 × 498 de ses calques (validé : la plus
 * grande des tailles essayées, pour l'illustration).
 */
export const SHEET_SCALE = 1.3;

const KIND_ICONS: Readonly<Record<NonNullable<SheetData['kind']>, IconName>> = {
  monster: 'dragon-head',
  spell: 'spell-book',
  terrain: 'castle',
  beacon: 'eye',
};

/** Sous le nom d'une carte sans archétype : son type. */
const KIND_WORDS: Readonly<Record<NonNullable<SheetData['kind']>, string>> = {
  monster: 'Monstre',
  spell: 'Sort',
  terrain: 'Terrain',
  beacon: 'Balise',
};

/** Coût en mana : le rond bleu du grimoire (en liste), avec le chiffre. */
function Cost({ value, small = false }: { value: number; small?: boolean }) {
  return (
    <span className={`mana-dot${small ? ' mana-dot--small' : ''}`} role="img" aria-label={`Coût : ${value} mana`} title="Coût en mana">
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
      <div className="sheet__scale" aria-hidden="true">
        <div className="sheet__bg" style={image} />
      </div>
      <div className="sheet__bg sheet__bg--veil" aria-hidden="true" />
    </>
  );
}

/** L'overframe de la carte de la fiche, s'il y en a une. */
export const sheetOverframe = (sheet: SheetData) => (sheet.art ? OVERFRAMES[sheet.art.cardId] : undefined);

/** Écart entre la fiche et le journal. */
const LOG_GAP = 12;
/** Journal replié : la hauteur de sa barre. */
export const JOURNAL_BAR = 46;

/**
 * Hauteur du journal en bas d'une colonne de `column` px : replié, sa barre ; ouvert, un tiers de la colonne, entre
 * 180 et 300 px (refonte du 2026-11-11 : il était trop petit).
 */
export function journalHeight(column: number, open: boolean): number {
  return open ? Math.round(Math.min(300, Math.max(180, column / 3))) : JOURNAL_BAR;
}

/**
 * Échelle d'une fiche à overframe (à sa taille, `SHEET_SCALE`) dans une colonne de `column` px de haut : 1 si elle tient
 * avec son débordement, sinon réduite pour laisser sa place au journal (`journal` px de haut), 0,6 au moins.
 */
export function overframeFit(column: number, headroom: number, journal = 72): number {
  return Math.min(1, Math.max(0.6, (column - journal - LOG_GAP) / ((SHEET_H + headroom) * SHEET_SCALE)));
}

/**
 * Place de la fiche dans la colonne : le haut du cadre toujours au même endroit, sous la place du plus grand débordement
 * (`MAX_HEADROOM`), qu'elle ait une overframe ou non ; une overframe y loge le sien, les autres fiches laissent l'espace
 * vide (il laisse passer les clics). Cette place grandit avec la fiche (`SHEET_SCALE`). Fenêtre basse : toutes les
 * fiches et cette place sont réduites du même facteur `fit` (`zoom` posé par game.css), elles restent identiques.
 */
export function sheetPlacement(overframe: OverframeDef | undefined, fit: number): CSSProperties {
  const paddingTop = Number(((MAX_HEADROOM - (overframe?.headroom ?? 0)) * SHEET_SCALE * fit).toFixed(2));
  return { paddingTop, '--sheet-fit': fit } as CSSProperties;
}

interface HoverSheetProps {
  sheet: SheetData;
  /** Animations permises (réglage, mouvements réduits). */
  animated?: boolean;
  /** Clic sur une fiche à overframe : l'ouvrir en grand. */
  onOpen?: () => void;
  /** Survol d'un effet actif : sa portée à montrer sur le plateau (`null` : plus rien). */
  onHoverReach?: (reach: readonly Position[] | null) => void;
}

export function HoverSheet({ sheet, animated = false, onOpen, onHoverReach }: HoverSheetProps) {
  const overframe = sheetOverframe(sheet);
  if (!overframe) return <SheetFrame sheet={sheet} animated={animated} onHoverReach={onHoverReach} />;
  return (
    <OverframeStage
      def={overframe}
      shiny={sheet.shiny}
      animated={animated}
      onClick={onOpen}
      title={onOpen ? 'Voir la carte en grand' : undefined}
    >
      {(layers) => <SheetFrame sheet={sheet} animated={animated} layers={layers} onHoverReach={onHoverReach} />}
    </OverframeStage>
  );
}

function SheetFrame(props: {
  sheet: SheetData;
  animated: boolean;
  layers?: OverframeLayers;
  onHoverReach?: (reach: readonly Position[] | null) => void;
}) {
  return props.sheet.art ? <CardFace {...props} /> : <PlainSheet sheet={props.sheet} />;
}

/** Carte plein cadre : monstre, terrain, sort, du plateau ou du grimoire. */
function CardFace({
  sheet,
  animated,
  layers,
  onHoverReach,
}: {
  sheet: SheetData;
  animated: boolean;
  layers?: OverframeLayers;
  onHoverReach?: (reach: readonly Position[] | null) => void;
}) {
  const owner = sheet.frame === 1 || sheet.frame === 2 ? sheet.frame : null;
  const classes = [
    'sheet',
    `sheet--${sheet.frame}`,
    'sheet--card',
    'sheet--full',
    sheet.kind && `is-jewel jewel--${sheet.kind}`,
    layers && 'sheet--of',
    sheet.shiny && 'sheet--shiny',
  ];
  return (
    <aside className={classes.filter(Boolean).join(' ')} aria-label={`Fiche : ${sheet.title}`}>
      {layers ? layers.back : <SheetBackground sheet={sheet} />}
      {!layers && sheet.shiny && <ShinyLayers animated={animated} />}
      {sheet.cost !== null && (
        <span className="sheet__cost">
          <Cost value={sheet.cost} />
        </span>
      )}
      {sheet.shiny && <span className="sheet__shiny">★ Brillante</span>}
      <div className="sheet__stack">
        <header className="sheet__name">
          <div className="sheet__name-text">
            <h2 className="sheet__title">{sheet.title}</h2>
            <p className="sheet__kind" title={sheet.type}>
              {sheet.typeIcon && <Icon name={sheet.typeIcon} />}
              {sheet.archetype || (sheet.kind ? KIND_WORDS[sheet.kind] : sheet.type)}
            </p>
          </div>
          {owner && <span className={`sheet__owner sheet__owner--p${owner}`}>J{owner}</span>}
        </header>
        {sheet.flavor && <p className="sheet__flavor">{sheet.flavor}</p>}
        {sheet.stats.length > 0 && (
          <div className="sheet__stats">
            {sheet.stats.map((stat) => (
              <div
                key={stat.label}
                className={`sheet__stat sheet__stat--${stat.icon}${stat.hurt ? ' is-hurt' : ''}`}
                aria-label={`${stat.label} ${stat.value}${stat.delta !== 0 ? ` (${stat.delta > 0 ? '+' : '−'}${Math.abs(stat.delta)})` : ''}`}
              >
                <span className="sheet__stat-value">
                  <Icon name={stat.icon} />
                  <strong>{stat.value}</strong>
                  {stat.delta !== 0 && (
                    <em className={`sheet__delta ${stat.delta > 0 ? 'is-up' : 'is-down'}`}>
                      {stat.delta > 0 ? `+${stat.delta}` : `−${-stat.delta}`}
                    </em>
                  )}
                </span>
                <span className="sheet__stat-label">{stat.label}</span>
              </div>
            ))}
          </div>
        )}
        {sheet.text.map((line) => (
          <p key={line} className="sheet__block sheet__block--note sheet__line">
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
                    <b className="sheet__item">
                      <CardRules text={item.name} />
                    </b>{' '}
                    ·{' '}
                  </>
                )}
                <CardRules text={item.text} />
              </p>
            ))}
          </div>
        )}
        {sheet.active.map((active, i) => (
          <ActiveBlock key={i} active={active} onHoverReach={onHoverReach} />
        ))}
      </div>
      {layers?.glare}
    </aside>
  );
}

/** Un effet actif (ou l'effet d'un sort) : son coût à droite, son nom en gras devant le texte ; sa portée au survol. */
function ActiveBlock({ active, onHoverReach }: { active: SheetActive; onHoverReach?: (reach: readonly Position[] | null) => void }) {
  const reach = active.reach && onHoverReach ? active.reach : null;
  return (
    <div
      className={`sheet__block sheet__block--active${reach ? ' has-reach' : ''}`}
      onMouseEnter={reach ? () => onHoverReach!(reach) : undefined}
      onMouseLeave={reach ? () => onHoverReach!(null) : undefined}
    >
      <p className="sheet__block-head">
        <Icon name="magic-swirl" />
        <span>Effet actif</span>
        {active.cost !== null && <Cost value={active.cost} small />}
      </p>
      <p className="sheet__line">
        {active.name && (
          <>
            <b className="sheet__item">{active.name}</b> ·{' '}
          </>
        )}
        <CardRules text={active.text} />
      </p>
    </div>
  );
}

/** Zone, case, piège : un encadré de la hauteur de son texte, sans illustration. */
function PlainSheet({ sheet }: { sheet: SheetData }) {
  return (
    <aside className={`sheet sheet--${sheet.frame}`} aria-label={`Fiche : ${sheet.title}`}>
      <div className="sheet__head">
        <h2 className="sheet__title">
          {sheet.title}
          {sheet.archetype && <small className="sheet__archetype">{sheet.archetype}</small>}
        </h2>
        {sheet.cost !== null && <Cost value={sheet.cost} />}
      </div>
      <div className="sheet__body">
        <p className="sheet__type">
          {sheet.typeIcon && <Icon name={sheet.typeIcon} />}
          {sheet.type}
        </p>
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
      </div>
    </aside>
  );
}

/** Carte survolée dans le grimoire : écart au panneau, et marges en haut (sous la barre du haut) et en bas de la fenêtre. */
export const PEEK_GAP = 10;
const PEEK_TOP = 66;
const PEEK_BOTTOM = 14;

/**
 * Place de la carte survolée dans le grimoire (2026-11-12) : collée à gauche du panneau du grimoire (`panelLeft`), à
 * hauteur de la tuile survolée, sans sortir de la fenêtre ; réduite (`fit`, 0,5 au moins) si elle n'y tient pas en
 * hauteur, débordement d'overframe (`headroom`) compris.
 */
export function peekPlacement(
  tile: { readonly top: number; readonly height: number },
  panelLeft: number,
  viewport: { readonly width: number; readonly height: number },
  headroom: number,
): { left: number; top: number; fit: number } {
  const height = (SHEET_H + headroom) * SHEET_SCALE;
  const fit = Math.min(1, Math.max(0.5, (viewport.height - PEEK_TOP - PEEK_BOTTOM) / height));
  const [w, h] = [SHEET_WIDTH * SHEET_SCALE * fit, height * fit];
  const left = Math.max(8, panelLeft - PEEK_GAP - w);
  const top = Math.max(PEEK_TOP, Math.min(tile.top + tile.height / 2 - h / 2, viewport.height - PEEK_BOTTOM - h));
  return { left: Math.round(left), top: Math.round(top), fit: Number(fit.toFixed(3)) };
}

/**
 * La carte survolée dans le grimoire, collée à gauche de son panneau : le regard reste près du grimoire au lieu de
 * passer à la fiche, à l'autre bout de l'écran. Elle ne prend pas la souris.
 */
export function GrimoirePeek({ sheet, tile, panelLeft, animated }: { sheet: SheetData; tile: DOMRect; panelLeft: number; animated: boolean }) {
  const viewport = typeof window === 'undefined' ? { width: 1280, height: 800 } : { width: window.innerWidth, height: window.innerHeight };
  const { left, top, fit } = peekPlacement(tile, panelLeft, viewport, sheetOverframe(sheet)?.headroom ?? 0);
  const style = { left, top, '--sheet-k': SHEET_SCALE, '--sheet-fit': fit } as CSSProperties;
  return (
    <div className="grimoire-peek" style={style}>
      <HoverSheet sheet={sheet} animated={animated} />
    </div>
  );
}

/**
 * Aperçu plein écran d'une fiche à overframe (§6.3 du handoff overframe) : rendu complet avec le débordement, centré,
 * à l'échelle min(1,8 ; (hauteur de la fenêtre − 80) / (498 + débordement)), sur un fond assombri et flouté. Échap
 * (géré par l'écran de jeu) ou un clic sur le fond le referme. Pas d'animation d'ouverture. Même mise en page que
 * dans la colonne (`SHEET_SCALE`) ; l'échelle de l'aperçu est celle de la fiche entière.
 */
export function SheetPreview({ sheet, animated, onClose }: { sheet: SheetData; animated: boolean; onClose: () => void }) {
  const overframe = sheetOverframe(sheet);
  const [height, setHeight] = useState(() => (typeof window === 'undefined' ? 900 : window.innerHeight));
  useEffect(() => {
    const resize = () => setHeight(window.innerHeight);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const scale = Math.min(1.8, (height - 80) / (SHEET_H + (overframe?.headroom ?? 0))) / SHEET_SCALE;
  const style = { transform: `translate(-50%, -50%) scale(${scale.toFixed(3)})`, '--sheet-k': SHEET_SCALE } as CSSProperties;
  return (
    <div className="sheet-preview" role="dialog" aria-label={`Carte : ${sheet.title}`}>
      <div className="sheet-preview__backdrop" title="Fermer (Échap)" onClick={onClose} />
      <div className="sheet-preview__card" style={style}>
        <HoverSheet sheet={sheet} animated={animated} />
      </div>
    </div>
  );
}

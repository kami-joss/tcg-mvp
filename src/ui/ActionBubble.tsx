// Bulle d'action (handoff V10, lot 11), en position fixe au-dessus du jeton (ou de la case, ou de la tuile du grimoire)
// qu'elle vise, sans animation. Elle se place à l'ouverture et quand sa cible, la vue, le zoom ou la taille de la fenêtre
// changent (quelques images, le temps des transitions de vue), et suit le défilement des colonnes ; jamais en boucle :
// elle ne suit pas le flottement des jetons.
import { useLayoutEffect, useRef } from 'react';
import type { Position } from '../engine';
import type { BubbleModel, BubbleRow } from './bubble';
import { Icon } from './Icon';

interface ActionBubbleProps {
  model: BubbleModel;
  /** Ce qui déplace la cible à l'écran : la vue et le zoom du plateau. */
  layoutKey: string;
  onPick: (row: BubbleRow) => void;
  onBack: () => void;
  onClose: () => void;
  /** Trajet à montrer sur le plateau au survol d'une ligne (`null` : aucun). */
  onHoverPath: (path: readonly Position[] | null) => void;
}

/** Durée pendant laquelle la bulle se replace après un changement : celle des transitions de vue. */
const PLACE_MS = 700;

const ARROW_ROTATION = { down: 0, left: 90, up: 180, right: 270 } as const;

/** Décalage du jeton par rapport à sa case, mesuré une fois à l'ouverture, en hauteurs de case. */
interface Offset {
  readonly key: string;
  readonly dx: number;
  readonly top: number;
  readonly bottom: number;
}

export function ActionBubble({ model, layoutKey, onPick, onBack, onClose, onHoverPath }: ActionBubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const offset = useRef<Offset | null>(null);
  const anchorKey = model.anchorCard ? `card:${model.anchorCard}` : model.anchor ? `${model.anchor.row},${model.anchor.col}` : '';
  const pageKey = model.header.kind === 'page' ? model.header.title : 'main';

  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      const cell = document.querySelector(model.anchorCard ? `[data-card="${model.anchorCard}"]` : `[data-cell="${anchorKey}"]`);
      if (!el || !cell) return;
      const rc = cell.getBoundingClientRect();
      const unit = model.anchorUnit;
      const key = `${anchorKey}|${unit}|${layoutKey}`;
      if (model.anchorCard) {
        offset.current = { key, dx: 0, top: 0, bottom: 0 };
      } else if (offset.current?.key !== key) {
        const body = unit ? document.querySelector(`[data-uid="${unit}"] .token__frame, [data-tid="${unit}"]`) : null;
        const rb = body?.getBoundingClientRect() ?? rc;
        const u = rc.height || 1;
        offset.current = {
          key,
          dx: (rb.left + rb.width / 2 - rc.left - rc.width / 2) / u,
          top: (Math.min(rc.top, rb.top - 24) - rc.top) / u,
          bottom: (Math.max(rc.bottom, rb.bottom) - rc.bottom) / u,
        };
      }
      const o = offset.current;
      const u = rc.height;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const cx = rc.left + rc.width / 2 + o.dx * u;
      const above = rc.top + o.top * u - 8;
      const below = above - h < 8;
      const top = below ? rc.bottom + o.bottom * u + 12 : above - h;
      const left = Math.min(Math.max(cx - w / 2, 8), vw - w - 8);
      el.style.left = `${left.toFixed(1)}px`;
      el.style.top = `${top.toFixed(1)}px`;
      const arrow = arrowRef.current;
      if (arrow) {
        arrow.style.left = `${Math.min(Math.max(cx - left - 7, 14), w - 28).toFixed(1)}px`;
        arrow.style.top = below ? '-8px' : 'auto';
        arrow.style.bottom = below ? 'auto' : '-8px';
        arrow.style.transform = below ? 'rotate(225deg)' : 'rotate(45deg)';
      }
    };
    place();
    let frame = 0;
    const start = performance.now();
    const loop = () => {
      place();
      frame = performance.now() - start < PLACE_MS ? requestAnimationFrame(loop) : 0;
    };
    frame = requestAnimationFrame(loop);
    const resize = () => {
      offset.current = null;
      place();
    };
    window.addEventListener('resize', resize);
    // Une colonne (ou le cadre du plateau) qui défile emporte la cible : la bulle la suit.
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorKey, model.anchorUnit, model.anchorCard, layoutKey, pageKey, model.rows.length]);

  const { header } = model;
  const hover = (row: BubbleRow | null) => onHoverPath(row?.enabled ? (row.path ?? null) : null);

  return (
    <div ref={ref} className="bubble" role="dialog" aria-label="Actions" onMouseLeave={() => hover(null)}>
      {header.kind === 'unit' ? (
        <div className="bubble__head">
          <span className={`bubble__dot bubble__dot--p${header.owner}`} />
          <span className="bubble__name">{header.name}</span>
          {header.note && <span className="bubble__note">{header.note}</span>}
          {header.hp && (
            <span className="bubble__hp">
              <Icon name="hearts" />
              {header.hp.before}
              <span className="bubble__hp-arrow">→</span>
              <span className="bubble__hp-after">{header.hp.after}</span>
            </span>
          )}
          <button type="button" className="bubble__close" title="Fermer (Échap)" onClick={onClose}>
            ×
          </button>
        </div>
      ) : header.kind === 'card' ? (
        <div className="bubble__head">
          <span className="bubble__kind">
            <Icon name={header.icon} />
          </span>
          <span className="bubble__name">{header.name}</span>
          <span className="bubble__note">{header.note}</span>
          <button type="button" className="bubble__close" title="Fermer (Échap)" onClick={onClose}>
            ×
          </button>
        </div>
      ) : (
        <div className="bubble__head bubble__head--page">
          <button type="button" className="bubble__back" title="Retour (Échap)" onClick={onBack}>
            ‹
          </button>
          <span className="bubble__name">{header.title}</span>
          <span className="bubble__note">{header.note}</span>
        </div>
      )}
      {model.rows.map((row, i) => (
        <div
          key={row.key}
          role="button"
          aria-disabled={!row.enabled}
          className={`bubble__row${row.enabled ? ' is-enabled' : ''}`}
          onClick={() => row.enabled && onPick(row)}
          onMouseEnter={() => hover(row)}
        >
          <span className={`bubble__icon bubble__icon--${row.tone}`}>
            <span
              className="bubble__glyph"
              style={row.arrow ? { rotate: `${ARROW_ROTATION[row.arrow]}deg` } : undefined}
            >
              <Icon name={row.icon} />
            </span>
            {row.boot && (
              <span className="bubble__boot">
                <Icon name="walking-boot" />
              </span>
            )}
          </span>
          <span className="bubble__text">
            <span className="bubble__title">{row.title}</span>
            <span className={`bubble__sub${!row.enabled && row.warn ? ' is-warn' : ''}`}>{row.subtitle}</span>
          </span>
          {row.cost !== null && (
            <span className="mana-pill mana-pill--row">
              <Icon name="water-drop" />
              {row.cost}
            </span>
          )}
          {i < 9 && <kbd className="bubble__kbd">{i + 1}</kbd>}
        </div>
      ))}
      <div ref={arrowRef} className="bubble__arrow" />
    </div>
  );
}

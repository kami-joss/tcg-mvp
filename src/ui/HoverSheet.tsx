// Fiche au survol, affichée dans la colonne de gauche (hors du plateau), sans capter la souris.
import { CARD_ART } from './art';
import { Icon } from './Icon';
import type { SheetData } from './sheet';

export function HoverSheet({ sheet }: { sheet: SheetData }) {
  const art = sheet.art && CARD_ART[sheet.art.cardId];

  return (
    <aside className={`sheet sheet--${sheet.frame}${sheet.kind ? ` is-jewel jewel--${sheet.kind}` : ''}`} role="tooltip">
      <div className="sheet__head">
        <h2 className="sheet__title">{sheet.title}</h2>
        {sheet.cost !== null && (
          <span className="sheet__cost">
            <Icon name="crystal-growth" />
            {sheet.cost}
          </span>
        )}
      </div>
      {sheet.art && (
        <div
          className={`sheet__art art${sheet.art.owner ? ` art--p${sheet.art.owner}` : ''}`}
          style={art ? { backgroundImage: `url(${art})` } : undefined}
        />
      )}
      <div className="sheet__body">
        <p className="sheet__type">
          {sheet.typeIcon && <Icon name={sheet.typeIcon} />}
          {sheet.type}
        </p>
        {sheet.stats.length > 0 && (
          <div className="sheet__stats">
            {sheet.stats.map((stat) => (
              <div key={stat.label} className="sheet__stat">
                <Icon name={stat.icon} />
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        )}
        {sheet.keywords.map((keyword) => (
          <p key={keyword.name} className="sheet__line">
            <b>{keyword.name}</b> <span className="sheet__passive">passif</span> · {keyword.text}
          </p>
        ))}
        {sheet.text.map((line) => (
          <p key={line} className="sheet__line">
            {line}
          </p>
        ))}
        {sheet.effect && (
          <div className="sheet__effect">
            <p className="sheet__effect-head">
              <Icon name="magic-swirl" />
              {sheet.effect.head}
            </p>
            <p className="sheet__line">{sheet.effect.text}</p>
          </div>
        )}
        {sheet.chips.length > 0 && (
          <div className="sheet__chips">
            {sheet.chips.map((chip, i) => (
              <span key={`${i}-${chip.text}`} className={`chip chip--${chip.tone}`}>
                {chip.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

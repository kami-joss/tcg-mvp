// Page des decks (`/decks?deck=…`) : la composition de chaque deck pré-construit, à consulter avant la partie. À gauche
// la liste des decks, au centre ses cartes en tuiles (monstres, sorts, terrains, avec le nombre d'exemplaires), à droite
// la fiche de la carte survolée ou cliquée, comme en partie (sans ligne pour la jouer).
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { DECKS } from '../engine';
import type { Card, CardId, Deck } from '../engine';
import { deckSections, deckSummary } from './decks';
import { Tile } from './Grimoire';
import { HoverSheet, SHEET_SCALE, SheetPreview, sheetOverframe, sheetPlacement } from './HoverSheet';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { PageHeader } from './PageHeader';
import type { Page } from './routes';
import { loadSettings, prefersReducedMotion } from './settings';
import { cardSheetOf } from './sheet';
import type { SheetData } from './sheet';

const KIND_ICONS: Readonly<Record<Card['kind'], IconName>> = { monster: 'dragon-head', spell: 'spell-book', terrain: 'castle' };

interface DecksScreenProps {
  initial: Deck;
  /** Changement de deck : l'adresse le garde (recharger la page rouvre ce deck). */
  onDeck: (deck: Deck) => void;
  onNavigate: (page: Page) => void;
}

export function DecksScreen({ initial, onDeck, onNavigate }: DecksScreenProps) {
  const [deck, setDeck] = useState(initial);
  const sections = deckSections(deck);
  const summary = deckSummary(deck);
  const [focused, setFocused] = useState<CardId>(sections[0]!.cards[0]!.cardId);
  const [preview, setPreview] = useState<SheetData | null>(null);
  const animated = loadSettings().animations && !prefersReducedMotion();
  const sheet = cardSheetOf(focused, deck.shiny?.includes(focused) ?? false);
  const peak = Math.max(1, ...summary.curve);

  const choose = (next: Deck) => {
    setDeck(next);
    setFocused(deckSections(next)[0]!.cards[0]!.cardId);
    onDeck(next);
  };

  return (
    <main className="home info">
      <PageHeader
        page="decks"
        title="Decks"
        lead="La composition de chaque deck. Survole ou clique une carte pour lire sa fiche."
        onNavigate={onNavigate}
      />

      <div className="decks">
        <nav className="decks__list" aria-label="Decks">
          {DECKS.map((d) => (
            <button key={d.id} type="button" className="decks__pick" aria-pressed={d.id === deck.id} onClick={() => choose(d)}>
              {d.name}
              <span className="panel__count">{d.cards.length}</span>
            </button>
          ))}
        </nav>

        <section className="decks__deck" aria-labelledby="deck-title">
          <header className="decks__head">
            <h2 id="deck-title">{deck.name}</h2>
            <p className="decks__facts">
              {summary.total} cartes
              {sections.map((section) => (
                <span key={section.kind}>
                  <Icon name={KIND_ICONS[section.kind]} />
                  {section.total} {section.title.toLowerCase()}
                </span>
              ))}
              <span>
                <Icon name="water-drop" />
                coût moyen {summary.averageCost.toLocaleString('fr-FR')}
              </span>
              {summary.archetype && <span>Archétype : {summary.archetype}</span>}
            </p>
            <figure className="decks__curve" aria-label="Courbe de mana : nombre de cartes par coût">
              {summary.curve.map((count, cost) => (
                <div key={cost} className="decks__bar" title={`Coût ${cost} : ${count} carte${count > 1 ? 's' : ''}`}>
                  <span className="decks__bar-count">{count || ''}</span>
                  <span className="decks__bar-fill" style={{ height: `${(count / peak) * 100}%` }} />
                  <span className="decks__bar-cost">{cost}</span>
                </div>
              ))}
            </figure>
          </header>

          <div className="grimoire decks__cards" style={{ '--grimoire-cols': 5 } as CSSProperties}>
            {sections.map(({ kind, title, cards, total }) => (
              <section key={kind} className={`grimoire__section grimoire__section--${kind}`} aria-label={title}>
                <h3 className="grimoire__heading">
                  <Icon name={KIND_ICONS[kind]} />
                  {title}
                  <span className="panel__count">{total}</span>
                </h3>
                <ul className="grimoire__cards">
                  {cards.map(({ cardId, count }) => (
                    <Tile
                      key={cardId}
                      cardId={cardId}
                      count={count}
                      list={false}
                      focused={focused === cardId}
                      shiny={deck.shiny?.includes(cardId) ?? false}
                      animated={animated}
                      onClick={() => setFocused(cardId)}
                      onHover={(rect) => rect && setFocused(cardId)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>

        <aside className="decks__sheet" style={{ '--sheet-k': SHEET_SCALE } as CSSProperties}>
          <div style={sheetPlacement(sheetOverframe(sheet), 1)}>
            <HoverSheet key={focused} sheet={sheet} animated={animated} onOpen={() => setPreview(sheet)} />
          </div>
        </aside>
      </div>

      {preview && <SheetPreview sheet={preview} animated={animated} onClose={() => setPreview(null)} />}
    </main>
  );
}

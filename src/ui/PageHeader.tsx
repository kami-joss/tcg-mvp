// En-tête des pages de consultation (decks, règles) : retour à l'accueil, et le passage d'une page à l'autre.
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { Page } from './routes';

/** Pages de consultation, dans l'ordre des onglets. */
const INFO_PAGES: readonly (readonly [Page, string])[] = [
  ['decks', 'Decks'],
  ['rules', 'Règles du jeu'],
];

interface PageHeaderProps {
  page: Page;
  title: string;
  lead: ReactNode;
  onNavigate: (page: Page) => void;
}

export function PageHeader({ page, title, lead, onNavigate }: PageHeaderProps) {
  return (
    <header className="info__header">
      <nav className="info__nav" aria-label="Pages">
        <button type="button" className="btn btn--ghost info__back" onClick={() => onNavigate('home')}>
          <Icon name="chevron-right" />
          Accueil
        </button>
        <div className="home__switch">
          {INFO_PAGES.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={page === id} onClick={() => onNavigate(id)}>
              {label}
            </button>
          ))}
        </div>
      </nav>
      <p className="home__kicker">TCG tactique</p>
      <h1>{title}</h1>
      <p className="home__lead">{lead}</p>
    </header>
  );
}

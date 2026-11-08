// Page des règles (`/regles`) : un sommaire à gauche, les règles au centre (`rulesPage.ts`), puis les mots-clés, les
// statuts et le lexique. Les mots du lexique sont en gras, définis au survol, comme sur les cartes.
import { CardRules } from './CardRules';
import { PageHeader } from './PageHeader';
import type { Page } from './routes';
import { KEYWORD_RULES, LEXICON_TERMS, RULES_SECTIONS, STATUS_TERMS, glossaryEntry } from './rulesPage';
import type { GlossaryTerm } from './rulesText';

/** Sections du sommaire après les règles. */
const EXTRA_SECTIONS = [
  ['mots-cles', 'Mots-clés'],
  ['statuts', 'Statuts'],
  ['lexique', 'Lexique'],
] as const;

function Terms({ groups }: { groups: readonly { readonly title: string; readonly terms: readonly GlossaryTerm[] }[] }) {
  return (
    <>
      {groups.map(({ title, terms }) => (
        <div key={title} className="rules__group">
          <h3>{title}</h3>
          <dl className="rules__terms">
            {terms.map((term) => {
              const { name, text } = glossaryEntry(term);
              return (
                <div key={term}>
                  <dt>{name}</dt>
                  <dd>{text}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </>
  );
}

export function RulesScreen({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <main className="home info">
      <PageHeader
        page="rules"
        title="Règles du jeu"
        lead="Un jeu de cartes tactique : invoque tes monstres, tiens les mana zones et détruis les monstres adverses. Survole un mot en gras pour sa définition."
        onNavigate={onNavigate}
      />

      <div className="rules">
        <nav className="rules__toc" aria-label="Sommaire">
          {RULES_SECTIONS.map(({ id, title }) => (
            <a key={id} href={`#${id}`}>
              {title}
            </a>
          ))}
          {EXTRA_SECTIONS.map(([id, title]) => (
            <a key={id} href={`#${id}`}>
              {title}
            </a>
          ))}
        </nav>

        <article className="rules__body">
          {RULES_SECTIONS.map(({ id, title, intro, points }) => (
            <section key={id} id={id} className="rules__section">
              <h2>{title}</h2>
              {intro.map((text) => (
                <p key={text}>
                  <CardRules text={text} />
                </p>
              ))}
              {points.length > 0 && (
                <ul>
                  {points.map((text) => (
                    <li key={text}>
                      <CardRules text={text} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <section id="mots-cles" className="rules__section">
            <h2>Mots-clés</h2>
            <p>Un mot-clé est un raccourci écrit sur la carte. Sa valeur (N) est propre à chaque carte.</p>
            <dl className="rules__terms">
              {Object.entries(KEYWORD_RULES).map(([keyword, { name, text }]) => (
                <div key={keyword}>
                  <dt>{name}</dt>
                  <dd>
                    <CardRules text={text} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section id="statuts" className="rules__section">
            <h2>Statuts</h2>
            <p>
              Un statut est posé par un effet, pour la durée qu’il indique, comptée en tours du camp de l’unité. Les statuts du même
              type se cumulent, sauf Camouflage et Invisible : on garde la plus grande portée. Sur un terrain, seul burn s’applique.
            </p>
            <Terms groups={STATUS_TERMS} />
          </section>

          <section id="lexique" className="rules__section">
            <h2>Lexique</h2>
            <p>Les mots des cartes : chacun a un seul sens, le même partout.</p>
            <Terms groups={LEXICON_TERMS} />
          </section>
        </article>
      </div>
    </main>
  );
}

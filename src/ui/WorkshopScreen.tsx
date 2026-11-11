// Page de l'atelier (`/atelier`) : à gauche les cartes des decks, au centre les champs de la carte choisie (coût, stats,
// valeurs des mots-clés, puis le coût de chaque effet actif avec son texte) avec ses prix dans les barèmes, à droite sa
// fiche, qui suit les réglages. Logique dans
// `workshop.ts` ; les réglages restent dans ce navigateur, l'export et l'import passent par un fichier, et en
// développement « Enregistrer dans le projet » les écrit dans le fichier des cartes et SPEC.md (`workshopSave.ts`).
import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { CARDS } from '../engine';
import type { Card, CardId } from '../engine';
import { splitCardName } from './cardText';
import { changedScales, costScales, loadScalesSettings, saveScalesSettings } from './costScales';
import type { ScalesSettings } from './costScales';
import { HoverSheet, SHEET_SCALE, SheetPreview, sheetOverframe, sheetPlacement } from './HoverSheet';
import { Icon } from './Icon';
import { PageHeader } from './PageHeader';
import type { Page } from './routes';
import { abilityRules, plainRules } from './rulesText';
import { loadSettings, prefersReducedMotion } from './settings';
import { cardSheetOf } from './sheet';
import type { SheetData } from './sheet';
import {
  exportPatches,
  importPatches,
  loadPatches,
  matchesQuery,
  parseFieldValue,
  resetCard,
  savePatches,
  setField,
  workshopCards,
  workshopFields,
  workshopGroups,
  workshopTitle,
} from './workshop';
import type { WorkshopField, WorkshopPatches } from './workshop';

const GROUPS = workshopGroups();

const KIND_LABELS: Readonly<Record<Card['kind'], string>> = { monster: 'Monstre', spell: 'Sort', terrain: 'Terrain' };

interface WorkshopScreenProps {
  onNavigate: (page: Page) => void;
  /** « Tester en partie » : l'accueil, avec les cartes de l'atelier choisies. */
  onTest?: () => void;
  /** Réglages de départ (tests) ; sinon ceux que garde ce navigateur. */
  initial?: WorkshopPatches;
  /** Carte choisie au départ (tests) ; sinon la première de la liste. */
  initialCard?: CardId;
}

type Message = { readonly tone: 'good' | 'bad'; readonly text: string };

const cardsText = (count: number) => `${count} carte${count > 1 ? 's' : ''} modifiée${count > 1 ? 's' : ''}`;

export function WorkshopScreen({ onNavigate, onTest, initial, initialCard }: WorkshopScreenProps) {
  const [patches, setPatches] = useState<WorkshopPatches>(() => initial ?? loadPatches());
  const [selected, setSelected] = useState<CardId>(initialCard ?? GROUPS[0]!.cards[0]!);
  const [query, setQuery] = useState('');
  // Saisies en cours qui ne sont pas (encore) une valeur valable, par champ de la carte choisie.
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const [message, setMessage] = useState<Message | null>(null);
  const [preview, setPreview] = useState<SheetData | null>(null);
  const [saving, setSaving] = useState(false);
  // Réglages des barèmes (page Barèmes) : les prix de la carte les suivent.
  const [scaleSettings, setScaleSettings] = useState<ScalesSettings>(() => loadScalesSettings());
  const fileInput = useRef<HTMLInputElement>(null);
  const animated = loadSettings().animations && !prefersReducedMotion();

  const cards = workshopCards(patches);
  const card = cards[selected];
  const { title, archetype } = splitCardName(card.name);
  const allFields = workshopFields(CARDS[selected]);
  // Les stats et les mots-clés en grille ; le coût des effets actifs à part, chacun avec le texte de son effet.
  const fields = allFields.filter((field) => field.effect === undefined);
  const effectFields = allFields.filter((field) => field.effect !== undefined);
  const sheet = cardSheetOf(cards, selected);
  const scales = card.kind === 'monster' ? costScales(card, scaleSettings) : null;
  const tunedScales = changedScales(scaleSettings);
  const costField = fields.find((field) => field.id === 'cost')!;
  const modified = Object.keys(patches).length;
  const groups = GROUPS.map((group) => ({ ...group, cards: group.cards.filter((id) => matchesQuery(cards, id, query)) })).filter(
    (group) => group.cards.length > 0,
  );

  const update = (next: WorkshopPatches) => {
    setPatches(next);
    savePatches(next);
  };
  const choose = (id: CardId) => {
    setSelected(id);
    setDrafts({});
  };
  const valueOf = (field: WorkshopField) => patches[selected]?.[field.id] ?? field.original;
  const edit = (field: WorkshopField, text: string) => {
    const value = parseFieldValue(field, text);
    setDrafts({ ...drafts, [field.id]: text });
    if (value !== null) update(setField(patches, selected, field.id, value));
  };

  /** Le champ d'un réglage ; `detail` : le texte de l'effet actif dont c'est le coût. */
  const fieldInput = (field: WorkshopField, detail?: string) => {
    const value = valueOf(field);
    const draft = drafts[field.id];
    const invalid = draft !== undefined && parseFieldValue(field, draft) === null;
    const changed = value !== field.original;
    return (
      <label key={field.id} className={`workshop__field${changed ? ' is-changed' : ''}`}>
        <span className="workshop__label">{field.label}</span>
        {detail && <span className="workshop__detail">{detail}</span>}
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={1}
          value={draft ?? String(value)}
          aria-invalid={invalid}
          onChange={(event) => edit(field, event.target.value)}
          onBlur={() => setDrafts(({ [field.id]: _done, ...rest }) => rest)}
        />
        <span className="workshop__hint">
          {invalid ? `Un entier de ${field.min} à ${field.max}` : changed ? `D’origine : ${field.original}` : ''}
        </span>
      </label>
    );
  };

  const exportFile = () => {
    const file = exportPatches(patches, tunedScales.length > 0 ? scaleSettings : undefined);
    const url = URL.createObjectURL(new Blob([file], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'atelier-cartes.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    const tuned = tunedScales.length > 0 ? `, avec les réglages des barèmes (${tunedScales.length})` : '';
    setMessage({ tone: 'good', text: `Fichier exporté : ${modified > 0 ? cardsText(modified) : 'aucune carte modifiée'}${tuned}.` });
  };
  const importFile = async (file: File) => {
    const result = importPatches(await file.text());
    if ('error' in result) {
      setMessage({ tone: 'bad', text: result.error });
      return;
    }
    update(result.patches);
    setDrafts({});
    if (result.scales) {
      setScaleSettings(result.scales);
      saveScalesSettings(result.scales);
    }
    const scalesText = result.scales ? ', et les réglages des barèmes' : '';
    setMessage({ tone: 'good', text: `Réglages importés : ${cardsText(Object.keys(result.patches).length)}${scalesText}.` });
  };
  // Étape 4 : le serveur de développement écrit le fichier des cartes et SPEC.md ; ces cartes deviennent celles d'origine.
  const saveProject = async () => {
    const question = `Écrire ces réglages dans le projet (${cardsText(modified)}) ? Le fichier des cartes (src/engine/cards.data.ts) et les tableaux de SPEC.md changent : ce seront les cartes d’origine.`;
    if (!window.confirm(question)) return;
    setSaving(true);
    try {
      const response = await fetch('/__atelier/enregistrer', { method: 'POST', body: exportPatches(patches) });
      const data = (await response.json()) as { error?: string; cards?: string[] };
      if (!response.ok || !data.cards) {
        setMessage({ tone: 'bad', text: data.error ?? 'Enregistrement impossible.' });
        return;
      }
      update({});
      setDrafts({});
      setMessage({
        tone: 'good',
        text: `Enregistré dans le projet : ${cardsText(data.cards.length)}, dans src/engine/cards.data.ts et SPEC.md. Ce sont maintenant les cartes d’origine ; reste à mettre à jour le doc « Cartes du TCG ».`,
      });
    } catch {
      setMessage({ tone: 'bad', text: 'Le serveur de développement ne répond pas : l’enregistrement ne marche qu’avec npm run dev.' });
    } finally {
      setSaving(false);
    }
  };
  const resetAll = () => {
    if (!window.confirm('Revenir aux cartes d’origine ? Tous les réglages de l’atelier seront effacés.')) return;
    update({});
    setDrafts({});
    setMessage({ tone: 'good', text: 'Toutes les cartes sont revenues à l’original.' });
  };

  return (
    <main className="home info">
      <PageHeader
        page="workshop"
        title="Atelier"
        lead="Règle le coût, les stats, la valeur des mots-clés et le coût des effets actifs des cartes ; leur fiche suit tes réglages. Ils restent dans ce navigateur : exporte-les pour les garder ou les partager."
        onNavigate={onNavigate}
      />

      <div className="workshop__bar">
        <label className="workshop__search">
          <Icon name="crosshair" />
          <input type="search" placeholder="Chercher une carte" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <span className="workshop__count">{modified > 0 ? cardsText(modified) : 'Cartes d’origine'}</span>
        <button type="button" className="btn btn--gold" onClick={onTest} disabled={modified === 0}>
          <Icon name="broadsword" />
          Tester en partie
        </button>
        {import.meta.env.DEV && (
          <button type="button" className="btn btn--ghost" onClick={() => void saveProject()} disabled={modified === 0 || saving}>
            Enregistrer dans le projet
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={exportFile} disabled={modified === 0 && tunedScales.length === 0}>
          Exporter
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => fileInput.current?.click()}>
          Importer
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importFile(file);
          }}
        />
        <button type="button" className="btn btn--ghost" onClick={resetAll} disabled={modified === 0}>
          Tout revenir à l’original
        </button>
        {message && (
          <p className={`workshop__message workshop__message--${message.tone}`} role="status">
            {message.text}
          </p>
        )}
      </div>

      <div className="workshop">
        <nav className="workshop__list" aria-label="Cartes">
          {groups.map((group) => (
            <section key={group.title} className="workshop__group" aria-label={group.title}>
              <h2>{group.title}</h2>
              {group.cards.map((id) => (
                <button key={id} type="button" className="workshop__pick" aria-pressed={id === selected} onClick={() => choose(id)}>
                  <span className="workshop__pick-name">{workshopTitle(cards, id)}</span>
                  {patches[id] && (
                    <span className="workshop__changed" title="Carte modifiée">
                      modifiée
                    </span>
                  )}
                  <span className="workshop__cost">
                    <Icon name="water-drop" />
                    {cards[id].cost}
                  </span>
                </button>
              ))}
            </section>
          ))}
          {groups.length === 0 && <p className="workshop__empty">Aucune carte ne correspond.</p>}
        </nav>

        <section className="workshop__editor" aria-labelledby="workshop-card">
          <header className="workshop__head">
            <div>
              <h2 id="workshop-card">{title}</h2>
              <p className="workshop__kind">
                {KIND_LABELS[card.kind]}
                {archetype && ` · ${archetype}`}
                {card.kind === 'monster' && card.formOf && ` · forme de ${workshopTitle(cards, card.formOf)}`}
              </p>
            </div>
            {patches[selected] && (
              <button type="button" className="btn btn--ghost" onClick={() => {
                  update(resetCard(patches, selected));
                  setDrafts({});
                }}
              >
                Revenir à l’original
              </button>
            )}
          </header>

          <div className="workshop__fields">{fields.map((field) => fieldInput(field))}</div>

          {card.kind === 'monster' && effectFields.length > 0 && (
            <div className="workshop__effects">
              <h3>Effets actifs</h3>
              <div className="workshop__fields workshop__fields--effects">
                {effectFields.map((field) => {
                  const ability = card.activated[field.effect!];
                  return fieldInput(field, ability ? plainRules(abilityRules(cards, ability)) : undefined);
                })}
              </div>
            </div>
          )}

          {scales && (
            <div className="workshop__scales">
              <h3>Prix dans les barèmes</h3>
              <ul>
                {scales.map(({ scale, mana, outOfScale }) => {
                  const usable = mana !== null && mana >= costField.min && mana <= costField.max;
                  return (
                    <li key={scale.id}>
                      <button
                        type="button"
                        className={`workshop__scale${outOfScale ? ' is-out' : mana === card.cost ? ' is-same' : ''}`}
                        disabled={!usable || mana === card.cost}
                        title={usable && mana !== card.cost ? `Coût suggéré : mettre la carte à ${mana} mana` : undefined}
                        onClick={() => {
                          if (!usable) return;
                          update(setField(patches, selected, 'cost', mana));
                          setDrafts({});
                        }}
                      >
                        <span>{scale.name}</span>
                        <strong>{outOfScale ? 'hors barème' : `${mana} mana`}</strong>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="workshop__hint-line">
                Clique un prix pour en faire le coût de la carte.
                {tunedScales.length > 0 && ' Barèmes réglés sur la page Barèmes.'}
              </p>
            </div>
          )}

          <p className="workshop__note">
            Le coût des effets actifs se règle ici ; leurs ciblages et leurs effets, pas encore.
          </p>
        </section>

        <aside className="decks__sheet" style={{ '--sheet-k': SHEET_SCALE } as CSSProperties}>
          <div style={sheetPlacement(sheetOverframe(sheet), 1)}>
            <HoverSheet key={selected} sheet={sheet} animated={animated} onOpen={() => setPreview(sheet)} />
          </div>
        </aside>
      </div>

      {preview && <SheetPreview sheet={preview} animated={animated} onClose={() => setPreview(null)} />}
    </main>
  );
}

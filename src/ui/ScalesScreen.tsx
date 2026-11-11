// Page des barèmes (`/baremes`) : on règle les stats d'un monstre (ou on charge un type mesuré au banc d'essai, ou un
// monstre des decks) et la page donne son coût dans chaque barème, la tranche où il tombe et s'il en sort, puis ce que
// disent les règles des combinaisons. Les tranches et les valeurs de chaque barème se règlent aussi ici ; ces réglages
// restent dans ce navigateur et l'atelier les reprend. Calculs dans `costScales.ts`.
import { useState } from 'react';
import type { CardId } from '../engine';
import { PageHeader } from './PageHeader';
import type { Page } from './routes';
import {
  COST_SCALES,
  MEASURED_TYPES,
  SCALE_STATS,
  STAT_BOUNDS,
  actionVerdict,
  changedScales,
  costScales,
  formatPoints,
  loadScalesSettings,
  measuredTypeOf,
  monsterGroups,
  parseSettingValue,
  resetScale,
  sameStats,
  saveScalesSettings,
  setScaleSetting,
  settingFields,
  settingValue,
  survivalVerdict,
} from './costScales';
import type { MonsterStats, ScaleId, ScaleStat, ScalesSettings, SettingField, Verdict } from './costScales';

const GROUPS = monsterGroups();

/** Les valeurs qui sont le poids d'une stat (le tableau du haut) ; les autres (plafonds du pondéré) vont avec les tranches. */
const isStat = (id: string): id is ScaleStat => (SCALE_STATS as readonly string[]).includes(id);
const CHOICES = new Map(GROUPS.flatMap((group) => group.monsters.map((monster) => [monster.cardId, monster] as const)));

function VerdictLine({ verdict }: { verdict: Verdict }) {
  return <p className={`scales__verdict scales__verdict--${verdict.ok ? 'ok' : 'warn'}`}>{verdict.text}</p>;
}

interface ScalesScreenProps {
  onNavigate: (page: Page) => void;
  /** Réglages des barèmes de départ (tests) ; sinon ceux que garde ce navigateur. */
  initial?: ScalesSettings;
}

export function ScalesScreen({ onNavigate, initial }: ScalesScreenProps) {
  const [stats, setStats] = useState<MonsterStats>(MEASURED_TYPES[0]!.stats);
  const [settings, setSettings] = useState<ScalesSettings>(() => initial ?? loadScalesSettings());
  // Saisies en cours qui ne sont pas (encore) une valeur possible, par « barème.champ ».
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  // Monstre des decks chargé ; il s'efface dès qu'une stat change.
  const [cardId, setCardId] = useState<CardId | ''>('');
  const results = costScales(stats, settings);
  const changed = changedScales(settings);
  const outOf = results.filter((result) => result.outOfScale).map((result) => result.scale.name);
  const type = measuredTypeOf(stats);
  const card = cardId === '' ? undefined : CHOICES.get(cardId);

  const setStat = (stat: ScaleStat, value: number) => {
    setStats({ ...stats, [stat]: value });
    setCardId('');
  };
  const update = (next: ScalesSettings) => {
    setSettings(next);
    saveScalesSettings(next);
  };
  /** La valeur saisie, si elle est possible pour ce champ et ce barème. */
  const accepted = (id: ScaleId, field: SettingField, text: string) => {
    const value = parseSettingValue(field, text);
    return value === null ? null : setScaleSetting(settings, id, field, value);
  };
  const edit = (id: ScaleId, field: SettingField, text: string) => {
    const next = accepted(id, field, text);
    setDrafts({ ...drafts, [`${id}.${field.id}`]: text });
    if (next) update(next);
  };
  /** Le champ d'un réglage : saisie gardée tant qu'elle n'est pas une valeur possible, surligné s'il n'est plus d'origine. */
  const input = (id: ScaleId, field: SettingField, label: string) => {
    const key = `${id}.${field.id}`;
    const draft = drafts[key];
    const value = settingValue(settings[id], field);
    return (
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={field.group === 'table' ? 1 : 0.05}
        value={draft ?? String(value)}
        aria-label={label}
        aria-invalid={draft !== undefined && accepted(id, field, draft) === null}
        className={value !== field.initial ? 'is-changed' : undefined}
        onChange={(event) => edit(id, field, event.target.value)}
        onBlur={() => setDrafts(({ [key]: _done, ...rest }) => rest)}
      />
    );
  };
  const reset = (id: ScaleId) => {
    update(resetScale(settings, id));
    setDrafts({});
  };
  const pickCard = (id: string) => {
    const choice = CHOICES.get(id as CardId);
    setCardId(choice ? choice.cardId : '');
    if (choice) setStats(choice.stats);
  };

  return (
    <main className="home info">
      <PageHeader
        page="scales"
        title="Barèmes"
        lead="Le coût d’un monstre selon chaque barème, pour les comparer. Règle ses stats, ou charge un type mesuré au banc d’essai ou un monstre des decks ; chaque barème se règle aussi, et l’atelier reprend tes réglages."
        onNavigate={onNavigate}
      />

      <div className="scales">
        <section className="scales__panel" aria-labelledby="scales-monster">
          <h2 id="scales-monster">Monstre</h2>
          <div className="scales__stats">
            {SCALE_STATS.map((stat) => {
              const { label, min, max } = STAT_BOUNDS[stat];
              return (
                <label key={stat} className="scales__stat">
                  <span>{label}</span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={1}
                    value={stats[stat]}
                    onChange={(event) => setStat(stat, Number(event.target.value))}
                  />
                  <output>{stats[stat]}</output>
                </label>
              );
            })}
          </div>
          <div className="scales__presets" role="group" aria-label="Types mesurés au banc d’essai">
            {MEASURED_TYPES.map((measured) => (
              <button
                key={measured.name}
                type="button"
                className="btn btn--ghost"
                aria-pressed={card === undefined && sameStats(measured.stats, stats)}
                onClick={() => {
                  setStats(measured.stats);
                  setCardId('');
                }}
              >
                {measured.name}
              </button>
            ))}
          </div>
          <label className="scales__pick">
            <span>Monstre des decks</span>
            <select value={cardId} onChange={(event) => pickCard(event.target.value)}>
              <option value="">Choisir un monstre</option>
              {GROUPS.map((group) => (
                <optgroup key={group.title} label={group.title}>
                  {group.monsters.map((monster) => (
                    <option key={monster.cardId} value={monster.cardId}>
                      {monster.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <p className="scales__ref">
            {card
              ? `${card.name} : coûte ${card.cost} mana aujourd’hui, effets compris.`
              : type
                ? `${type.name} : juste prix mesuré ${formatPoints(type.fairPrice)} mana (le coût auquel il gagnerait une partie sur deux).`
                : ''}
          </p>
        </section>

        <section className="scales__panel" aria-labelledby="scales-weights">
          <h2 id="scales-weights">Valeur de chaque stat dans les barèmes</h2>
          <div className="scales__weights-wrap">
            <table className="scales__weights-table">
              <thead>
                <tr>
                  <th scope="col">Barème</th>
                  {SCALE_STATS.map((stat) => (
                    <th key={stat} scope="col">
                      {STAT_BOUNDS[stat].label}
                    </th>
                  ))}
                  <th scope="col">
                    <span className="sr-only">Revenir à l’origine</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COST_SCALES.map((scale) => {
                  const fields = settingFields(scale);
                  return (
                    <tr key={scale.id}>
                      <th scope="row">
                        {scale.name}
                        {changed.includes(scale.id) && <span className="scales__changed">réglé</span>}
                      </th>
                      {SCALE_STATS.map((stat) => {
                        const field = fields.find((f) => f.group === 'values' && f.id === stat);
                        return (
                          <td key={stat}>
                            {field ? input(scale.id, field, `${scale.name} : valeur d’un point de ${STAT_BOUNDS[stat].label}`) : '—'}
                          </td>
                        );
                      })}
                      <td>
                        <button type="button" className="btn btn--ghost" disabled={!changed.includes(scale.id)} onClick={() => reset(scale.id)}>
                          Revenir à l’origine
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="scales__hint">
            Chaque stat compte fois sa valeur dans la formule du barème. Les tranches, et les plafonds du barème pondéré, se
            règlent sous chaque barème, plus bas.
          </p>
        </section>

        <section className="scales__panel" aria-labelledby="scales-costs">
          <h2 id="scales-costs">Coût selon chaque barème</h2>
          <p className="scales__alert" role="status">
            {outOf.length > 0 ? `Hors barème : ${outOf.join(', ')}.` : ''}
          </p>
          <div className="scales__cards">
            {results.map(({ scale, settings: own, mana, outOfScale, detail }) => (
              <article key={scale.id} className={`scales__card${outOfScale ? ' scales__card--out' : ''}`}>
                <h3>{scale.name}</h3>
                <p className="scales__formula">{scale.formula(own.values)}</p>
                <p className="scales__mana">{outOfScale ? 'Hors barème' : `${mana} mana`}</p>
                <p className="scales__detail">
                  {detail}
                  {outOfScale ? ` : au-delà de ${formatPoints(own.table.max)}` : ''}
                </p>
              </article>
            ))}
          </div>
          <div className="scales__tables">
            {results.map(({ scale, settings: own, tiers, mana, outOfScale }) => (
              <div key={scale.id} className="scales__table">
                <h3>{scale.name}</h3>
                <ol className="scales__tiers">
                  {tiers.map((tier, index) => (
                    <li key={tier} aria-current={mana === index + 1 ? 'true' : undefined}>
                      <span>{tier}</span>
                      <strong>{index + 1} mana</strong>
                    </li>
                  ))}
                  <li className="scales__tier--out" aria-current={outOfScale ? 'true' : undefined}>
                    <span>&gt; {formatPoints(own.table.max)}</span>
                    <strong>hors barème</strong>
                  </li>
                </ol>
                <details className="scales__settings">
                  <summary>{settingFields(scale).some((f) => f.group === 'values' && !isStat(f.id)) ? 'Régler les tranches et les plafonds' : 'Régler les tranches'}</summary>
                  <div className="scales__fields">
                    {settingFields(scale)
                      .filter((field) => field.group === 'table' || !isStat(field.id))
                      .map((field) => (
                        <label key={field.id} className="scales__field">
                          <span>
                            {field.label}
                            {field.group === 'table' ? ' (points)' : ''}
                          </span>
                          {input(scale.id, field, `${scale.name} : ${field.label}`)}
                        </label>
                      ))}
                  </div>
                </details>
              </div>
            ))}
          </div>
        </section>

        <section className="scales__panel" aria-labelledby="scales-combos">
          <h2 id="scales-combos">Combinaison des stats</h2>
          <VerdictLine verdict={survivalVerdict(stats)} />
          <VerdictLine verdict={actionVerdict(stats)} />
        </section>
      </div>
    </main>
  );
}

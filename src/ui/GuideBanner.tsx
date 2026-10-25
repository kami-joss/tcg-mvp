// Bandeau guide, au-dessus du plateau : ce que la sélection permet de faire, et les choix en attente
// (effet activé, avancée, direction de Bourrasque ou d'une zone en ligne, monstre à invoquer, case de téléportation).
import type { ReactNode } from 'react';
import { getCard, getMonsterCard } from '../engine';
import type { Action, Direction, PlayerView } from '../engine';
import { abilityExplanation, effectText } from './cardText';
import { Icon } from './Icon';
import { NO_SELECTION, getAdvanceChoices, getAreaDirections, getEffectActions, getPushChoices, getSummonChoices } from './interaction';
import type { Highlight, Selection } from './interaction';

const DIRECTION_LABELS: Readonly<Record<Direction, string>> = {
  up: '↑ Haut',
  down: '↓ Bas',
  left: '← Gauche',
  right: '→ Droite',
};

/** Direction à l'écran, dans une phrase : « vers le haut ». */
const DIRECTION_WORDS: Readonly<Record<Direction, string>> = { up: 'le haut', down: 'le bas', left: 'la gauche', right: 'la droite' };

/** Sur un plateau retourné, le « haut » du plateau est en bas de l'écran : les boutons parlent de l'écran. */
const SCREEN_DIRECTION: Readonly<Record<Direction, Direction>> = { up: 'down', down: 'up', left: 'right', right: 'left' };

interface GuideBannerProps {
  view: PlayerView;
  selection: Selection;
  highlights: ReadonlyMap<string, Highlight>;
  helpOpen: boolean;
  onToggleHelp: () => void;
  /** `null` si le plateau n'a pas de fond illustré. */
  onToggleArt: (() => void) | null;
  onAction: (action: Action) => void;
  onSelect: (selection: Selection) => void;
  /** Plateau retourné vers le joueur actif. */
  flipped: boolean;
  /** Une animation se joue : les choix attendent. */
  busy: boolean;
}

type Tone = 'p1' | 'p2' | 'select' | 'effect' | 'card' | 'gold';

interface Guide {
  tone: Tone;
  title: ReactNode;
  text: ReactNode;
  buttons: ReactNode;
}

export function GuideBanner(props: GuideBannerProps) {
  const { tone, title, text, buttons } = guideFor(props);
  return (
    <section className={`guide guide--${tone}${props.busy ? ' is-busy' : ''}`} aria-live="polite">
      <span className="guide__dot" />
      <div className="guide__body">
        <h2 className="guide__title">{title}</h2>
        <p className="guide__text">{text}</p>
      </div>
      <div className="guide__buttons">{buttons}</div>
    </section>
  );
}

function guideFor({ view, selection, highlights, helpOpen, onToggleHelp, onToggleArt, onAction, onSelect, flipped }: GuideBannerProps): Guide {
  const cancel = (
    <button type="button" className="btn btn--ghost" onClick={() => onSelect(NO_SELECTION)}>
      Annuler
    </button>
  );
  const count = (highlight: Highlight) => [...highlights.values()].filter((h) => h === highlight).length;

  switch (selection.kind) {
    case 'none': {
      const p = view.viewer;
      // Contre l'IA : pendant son tour, on la regarde jouer.
      if (view.activePlayer !== view.viewer && view.winner === null) {
        return {
          tone: `p${view.activePlayer}`,
          title: `Le Joueur ${view.activePlayer} joue…`,
          text: 'Ses actions s’enchaînent une à une sur le plateau et dans le journal. Survole n’importe quoi pour lire sa fiche.',
          buttons: null,
        };
      }
      return {
        tone: `p${p}`,
        title: `À toi, Joueur ${p}.`,
        text: `Clique un de tes monstres (${p === 1 ? 'ronds bleus' : 'ronds rouges'}) ou une carte de ton grimoire. Survole n’importe quoi pour lire sa fiche.`,
        buttons: (
          <>
            <button type="button" className="btn btn--ghost" aria-pressed={helpOpen} onClick={onToggleHelp}>
              {helpOpen ? 'Masquer l’aide' : 'Aide'}
            </button>
            {onToggleArt && (
              <button type="button" className="btn btn--ghost" onClick={onToggleArt}>
                Fond du plateau
              </button>
            )}
          </>
        ),
      };
    }

    case 'unit': {
      const unit = view.units[selection.unitId];
      if (unit?.kind !== 'monster') return { tone: 'select', title: '', text: '', buttons: cancel };
      const card = getMonsterCard(unit.cardId);
      const effects = getEffectActions(view, unit.id);

      if (selection.mode === 'effect' && card.activated) {
        const ability = card.activated;
        const effectName = card.activated.name ?? 'Effet';
        const backToAct = (
          <button type="button" className="btn btn--ghost" onClick={() => onSelect({ ...selection, mode: 'act' })}>
            Annuler l’effet
          </button>
        );
        // Zone en ligne (Raz de marée, Vent violent) : d'abord la direction, d'un clic sur une ligne ou d'un bouton.
        if (ability.targeting.type === 'zone' && ability.targeting.zone === 'line3') {
          const pick = (direction: Direction) => {
            const actions = effects.filter((a) => a.target.kind === 'area' && a.target.direction === direction);
            if (actions.length === 1) onAction(actions[0]!);
            else onSelect({ kind: 'areaDirection', unitId: unit.id, direction });
          };
          return {
            tone: 'effect',
            title: `${effectName} · ${card.activated.manaCost} mana : choisis la direction.`,
            text: `${abilityExplanation(ability)}. Clique une case violette, ou un bouton ; ${card.name} se tourne vers elle.`,
            buttons: (
              <>
                {getAreaDirections(view, unit.id).map((direction) => (
                  <button key={direction} type="button" className="btn btn--effect" onClick={() => pick(direction)}>
                    {DIRECTION_LABELS[flipped ? SCREEN_DIRECTION[direction] : direction]}
                  </button>
                ))}
                {backToAct}
              </>
            ),
          };
        }
        // Effet de zone : la zone est en violet ; on le lance d'un bouton (Vent violent : un bouton par distance).
        if (ability.targeting.type === 'zone') {
          const areaActions = effects.filter((a) => a.target.kind === 'area');
          return {
            tone: 'effect',
            title: `${effectName} · ${card.activated.manaCost} mana`,
            text: `${abilityExplanation(ability)}. Zone en violet.`,
            buttons: (
              <>
                {areaActions.map((action) => (
                  <button key={JSON.stringify(action.target)} type="button" className="btn btn--effect" onClick={() => onAction(action)}>
                    <Icon name="magic-swirl" />
                    {action.target.kind === 'area' && action.target.distance
                      ? `Recul de ${action.target.distance}`
                      : `Lancer ${effectName}`}
                  </button>
                ))}
                {backToAct}
              </>
            ),
          };
        }
        // Effet sur lui-même (Dopage) : un bouton le lance, comme un clic sur le monstre.
        if (ability.targeting.type === 'self' && !ability.effects.some((effect) => effect.type === 'evolve')) {
          const launch = effects.find((action) => action.target.kind === 'unit');
          return {
            tone: 'effect',
            title: `${effectName} · ${card.activated.manaCost} mana`,
            text: `${card.name}, sur lui-même : ${ability.effects.map(effectText).join(' + ')}.`,
            buttons: (
              <>
                {launch && (
                  <button type="button" className="btn btn--effect" onClick={() => onAction(launch)}>
                    <Icon name="magic-swirl" />
                    {`Lancer ${effectName}`}
                  </button>
                )}
                {backToAct}
              </>
            ),
          };
        }
        // Évolution : un bouton par dragon élémentaire du grimoire.
        if (ability.targeting.type === 'self') {
          return {
            tone: 'effect',
            title: `${effectName} · ${card.activated.manaCost} mana`,
            text: `${abilityExplanation(ability)} Choisis le dragon :`,
            buttons: (
              <>
                {effects.map((action) =>
                  action.target.kind === 'card' ? (
                    <button key={action.target.cardId} type="button" className="btn btn--effect" onClick={() => onAction(action)}>
                      <Icon name="magic-swirl" />
                      {getCard(action.target.cardId).name}
                    </button>
                  ) : null,
                )}
                {backToAct}
              </>
            ),
          };
        }
        const burn = ability.effects.some((effect) => effect.type === 'burnCell');
        if (burn) {
          return {
            tone: 'effect',
            title: `${card.activated.name ?? card.name} · ${card.activated.manaCost} mana : choisis une case violette à brûler.`,
            text: `${abilityExplanation(ability)}. La case est visible de l’adversaire et reste.`,
            buttons: (
              <button type="button" className="btn btn--ghost" onClick={() => onSelect({ ...selection, mode: 'act' })}>
                Annuler l’effet
              </button>
            ),
          };
        }
        const trap = ability.effects.some((effect) => effect.type === 'placeTrap');
        const summon = ability.effects.some((effect) => effect.type === 'summon');
        const teleport = ability.effects.some((effect) => effect.type === 'teleport');
        return {
          tone: 'effect',
          title: trap
            ? 'Choisis une case violette à piéger.'
            : summon
              ? `Invocation · ${card.activated.manaCost} mana + le monstre : choisis une case violette.`
              : teleport
                ? `Téléportation · ${card.activated.manaCost} mana : choisis l’allié à téléporter.`
                : 'Choisis une cible violette.',
          text: trap
            ? 'Le piège reste invisible pour l’adversaire, jusqu’au début de ton prochain tour.'
            : summon || teleport
              ? abilityExplanation(ability)
              : `${card.name} : ${abilityExplanation(ability)}.`,
          buttons: (
            <button type="button" className="btn btn--ghost" onClick={() => onSelect({ ...selection, mode: 'act' })}>
              Annuler l’effet
            </button>
          ),
        };
      }

      const parts = [];
      if (count('move') > 0) {
        parts.push(`turquoise pour avancer (${unit.mobilityLeft} pas restant${unit.mobilityLeft > 1 ? 's' : ''})`);
      }
      if (count('attack') > 0) parts.push('cadre blanc pour attaquer');
      return {
        tone: 'select',
        title: card.name,
        text:
          parts.length > 0
            ? `Clique une case ${parts.join(', ou une case ')}.`
            : effects.length > 0
              ? 'Il ne peut plus bouger ni attaquer, mais son effet est disponible.'
              : 'Ce monstre a fini pour ce tour. Choisis-en un autre ou termine ton tour.',
        buttons: (
          <>
            {effects.length > 0 && card.activated && (
              <button type="button" className="btn btn--effect" onClick={() => onSelect({ ...selection, mode: 'effect' })}>
                <Icon name="magic-swirl" />
                Effet · {card.activated.manaCost} mana
              </button>
            )}
            {cancel}
          </>
        ),
      };
    }

    case 'inspect': {
      const unit = view.units[selection.unitId];
      if (!unit) return { tone: 'select', title: '', text: '', buttons: cancel };
      const name = getCard(unit.cardId).name;
      const enemy = unit.owner !== view.viewer;
      return {
        tone: `p${unit.owner}`,
        title: enemy ? `${name} adverse` : name,
        text:
          enemy && unit.kind === 'monster'
            ? 'Tu ne peux pas le contrôler. À son prochain tour : en orange, où il pourra aller ; en rouge, où il pourra frapper.'
            : 'Survole-le pour lire sa fiche.',
        buttons: cancel,
      };
    }

    case 'card': {
      const card = getCard(selection.cardId);
      // Sort sans choix de cible (Pénombre) : un bouton, ou un clic sur un des monstres touchés.
      const all = view.legalActions.find(
        (a) => a.type === 'playCard' && a.cardId === selection.cardId && a.target.kind === 'all',
      );
      if (all && card.kind === 'spell') {
        return {
          tone: 'card',
          title: `Jouer ${card.name} · ${card.cost} mana`,
          text: `${abilityExplanation(card.ability)}. Clique le bouton, ou un de tes monstres dorés.`,
          buttons: (
            <>
              <button type="button" className="btn btn--gold" onClick={() => onAction(all)}>
                Lancer {card.name}
              </button>
              {cancel}
            </>
          ),
        };
      }
      const where =
        card.kind === 'monster'
          ? 'Clique une case dorée de ta zone d’invocation.'
          : card.kind === 'terrain'
            ? 'Clique une case dorée : une mana zone sous un de tes monstres.'
            : `Clique une cible dorée. ${abilityExplanation(card.ability)}.`;
      return {
        tone: 'card',
        title: `Jouer ${card.name} · ${card.cost} mana`,
        text: count('target') > 0 ? where : 'Aucune case valide pour l’instant.',
        buttons: cancel,
      };
    }

    case 'push': {
      const target = view.units[selection.unitId];
      return {
        tone: 'card',
        title: 'Bourrasque : dans quelle direction ?',
        text: `${target ? getCard(target.cardId).name : 'La cible'} recule dans la direction choisie : chaque bouton indique sa case d’arrivée.`,
        buttons: (
          <>
            {getPushChoices(view, selection).map(({ direction, destination, action }) => (
              <button key={direction} type="button" className="btn btn--gold" onClick={() => onAction(action)}>
                {DIRECTION_LABELS[flipped ? SCREEN_DIRECTION[direction] : direction]} · ({destination.row}, {destination.col})
              </button>
            ))}
            {cancel}
          </>
        ),
      };
    }

    case 'summonAt': {
      const backToEffect = (
        <button type="button" className="btn btn--ghost" onClick={() => onSelect({ kind: 'unit', unitId: selection.unitId, mode: 'effect' })}>
          Autre case
        </button>
      );
      return {
        tone: 'effect',
        title: `Invoquer en (${selection.pos.row}, ${selection.pos.col}) : quel monstre ?`,
        text: 'Chaque bouton indique le coût total : 1 mana pour l’effet, plus le coût du monstre.',
        buttons: (
          <>
            {getSummonChoices(view, selection).map(({ cardId, action }) => {
              const card = getCard(cardId);
              const effectCost = summonerCost(view, selection.unitId);
              return (
                <button key={cardId} type="button" className="btn btn--effect" onClick={() => onAction(action)}>
                  <Icon name="magic-swirl" />
                  {card.name} · {effectCost + card.cost} mana
                </button>
              );
            })}
            {backToEffect}
            {cancel}
          </>
        ),
      };
    }

    case 'teleport': {
      const target = view.units[selection.targetId];
      return {
        tone: 'effect',
        title: `Téléporter ${target ? getCard(target.cardId).name : 'l’allié'} : choisis une case violette.`,
        text: 'Il garde sa mobilité, son attaque et son orientation. Clique un autre allié pour changer.',
        buttons: (
          <>
            <button type="button" className="btn btn--ghost" onClick={() => onSelect({ kind: 'unit', unitId: selection.unitId, mode: 'effect' })}>
              Autre allié
            </button>
            {cancel}
          </>
        ),
      };
    }

    case 'areaDirection': {
      const unit = view.units[selection.unitId];
      const ability = unit?.kind === 'monster' ? getMonsterCard(unit.cardId).activated : null;
      if (!unit || !ability) return { tone: 'effect', title: '', text: '', buttons: cancel };
      const words = DIRECTION_WORDS[flipped ? SCREEN_DIRECTION[selection.direction] : selection.direction];
      const actions = getEffectActions(view, unit.id).filter(
        (a) => a.target.kind === 'area' && a.target.direction === selection.direction,
      );
      return {
        tone: 'effect',
        title: `${ability.name ?? 'Effet'} vers ${words} : choisis la distance du recul.`,
        text: 'Ligne en violet. Les ennemis reculent dans ce sens, le plus éloigné d’abord.',
        buttons: (
          <>
            {actions.map((action) => (
              <button key={JSON.stringify(action.target)} type="button" className="btn btn--effect" onClick={() => onAction(action)}>
                <Icon name="magic-swirl" />
                {action.target.kind === 'area' && action.target.distance ? `Recul de ${action.target.distance}` : `Lancer ${ability.name ?? 'l’effet'}`}
              </button>
            ))}
            <button type="button" className="btn btn--ghost" onClick={() => onSelect({ kind: 'unit', unitId: unit.id, mode: 'effect' })}>
              Autre direction
            </button>
            {cancel}
          </>
        ),
      };
    }

    case 'advance': {
      const choices = getAdvanceChoices(view, selection);
      const attacker = view.units[selection.unitId];
      const target = view.units[selection.targetId];
      if (!choices || !attacker || !target) return { tone: 'gold', title: '', text: '', buttons: cancel };
      return {
        tone: 'gold',
        title: 'Destruction au contact',
        text: `${getCard(attacker.cardId).name} va détruire ${getCard(target.cardId).name}. Prendre sa place gratuitement ?`,
        buttons: (
          <>
            <button type="button" className="btn btn--gold" onClick={() => onAction(choices.advance)}>
              Avancer
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => onAction(choices.stay)}>
              Rester
            </button>
            {cancel}
          </>
        ),
      };
    }
  }
}

/** Coût de l'effet actif du monstre (Invocateur), pour afficher le coût total d'une invocation. */
function summonerCost(view: PlayerView, unitId: string): number {
  const unit = view.units[unitId];
  return unit?.kind === 'monster' ? (getMonsterCard(unit.cardId).activated?.manaCost ?? 0) : 0;
}

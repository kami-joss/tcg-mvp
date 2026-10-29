// Texte de carte balisé (nom distinct de rulesText.ts : macOS ignore la casse des noms de fichiers) (`rulesText.ts`) : les mots du lexique en gras, leur définition au survol.
import { GLOSSARY, rulesSegments } from './rulesText';

export function CardRules({ text }: { text: string }) {
  return (
    <>
      {rulesSegments(text).map((segment, i) =>
        segment.term ? (
          <b key={i} className="term" title={GLOSSARY[segment.term]}>
            {segment.text}
          </b>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}

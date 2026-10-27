Lis `docs/design_handoff_overframe/README.md` en entier, puis ouvre `Fiches cartes.dc.html` (servi avec `npx serve`), section « Tour 2 », et survole les cartes 2a, 2c, 2d et 2e.

Objectif : un composant générique `Overframe`, en React + TypeScript dans notre code existant. Le HTML est une référence visuelle, pas du code à copier.

Travaille par étapes et arrête-toi après chacune pour que je teste :
1. Données : champ `overframe` dans la définition de carte (format de `overframes.json`), booléen `shiny` sur l'exemplaire de carte. Copie `assets/art/` dans les assets publics.
2. Composant `Overframe` dans la fiche 280 × 498 : calques, animations et inclinaison, normal puis shiny, shiny générique pour les cartes sans images `_shiny`. Compare côte à côte avec la maquette : le pop doit se superposer au pixel près à l'illustration.
3. Colonne de gauche : encadré adverse et fiche hors de la zone qui défile, pour que le débordement ne soit pas coupé.
4. Tuiles du grimoire (§6.2) et aperçu plein écran (§6.3 : clic sur la fiche, clic droit sur une tuile).
5. Performance (§5) : IntersectionObserver, onglet caché, reduced-motion, nettoyage au démontage.

Avant chaque étape, donne-moi un plan court : fichiers touchés et nouveaux composants. Pas d'animation d'ouverture sur l'aperçu.

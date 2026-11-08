Lis `docs/design_handoff_zones/README.md` en entier.

Objectif : remplacer le surlignage des cases de déplacement par des halos translucides (cyan = aller, orange = attaquer) et ajouter la zone de danger ennemie (contour violet), dans notre code existant (React + TypeScript), pour toutes les cartes.

Travaille par étapes et arrête-toi après chacune pour que je teste :
1. Questions : pose-moi les questions du §3 du README. N'écris rien avant mes réponses.
2. Calcul : fonctions pures pour les zones « aller », « attaquer » et « danger » (§2), en réutilisant `movement.ts` et la logique de ciblage de `combat.ts`, avec la case précédente de chaque case pour le chemin. Tests : alliés exclus, X hautes et basses respectées, portée 2+, `vol`, union de plusieurs ennemis.
3. Rendu : halos, contour violet continu, survol et chemin (§1), en vue isométrique J1, J2 et de dessus. Valeurs exactes du README.
4. Légende et boutons « Menace ennemie » et « Chemin au survol ».

Avant chaque étape, donne-moi un plan court : fichiers touchés et nouvelles fonctions.

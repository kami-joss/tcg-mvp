# Handoff : overframes animées (normale + shiny)

## Vue d'ensemble
Une **overframe** est une carte dont le haut du personnage sort du cadre. Elle est animée : respiration, flottement, particules, reflet, inclinaison au survol. La variante **shiny** ajoute un reflet holographique, des étincelles arc-en-ciel, un cadre doré et des images recolorées.

Deux cartes sont prêtes :
- **Archer de glace**, maquettes `2a` (normale) et `2c` (shiny) ;
- **Archer du feu**, maquettes `2d` (normale) et `2e` (shiny « Flamme bleue »), avec en plus clignement des yeux et tresses qui balancent.

Le but est un **composant générique**. Toute carte qui fournit ses calques (`overframes.json`) devient une overframe, et n'importe quel exemplaire peut être shiny.

## À propos des fichiers
`Fiches cartes.dc.html` est une **maquette de référence en HTML**, pas du code à copier. Il faut **recréer ce rendu dans le code existant du jeu (React + TypeScript)**, avec ses composants de fiche et de grimoire (lots 9 et 10 du handoff plateau).

Ouvrir la maquette : `npx serve .` dans ce dossier, puis `Fiches cartes.dc.html`, section « Tour 2 · Overframe animée ». Les sections Tour 3 et Tour 4 utilisent d'autres images, non fournies ici : ignore-les.

## Fidélité
**Haute fidélité** pour la fiche 280 × 498 : positions, durées, couleurs et courbes sont finales et listées ici. Les contextes **grimoire** et **aperçu plein écran** n'ont pas de maquette : ils suivent les règles du §6.

## 1. Modèle de données
- **Définition de carte** : champ optionnel `overframe` qui reprend une entrée de `overframes.json` (calques, ancre de respiration, particules, couleurs normales et shiny).
- **Exemplaire de carte** (carte possédée, en main ou en grimoire, monstre posé) : booléen `shiny`. Le jeu choisit la variante d'après l'exemplaire, jamais d'après la définition.
- **Images shiny** : même nom + `_shiny`, mêmes dimensions. Si une carte n'a pas d'images shiny, le **shiny générique** s'applique sur les images normales : holo, reflet arc-en-ciel, étincelles, cadre doré et badge (§4).
- Une carte sans `overframe` mais avec `shiny: true` reçoit aussi le shiny générique sur son illustration habituelle (lot 10).

## 2. Structure (du bas vers le haut)
Toutes les cotes sont dans le repère de la fiche **280 × 498**. Dans les autres contextes, le tout est mis à l'échelle (`transform: scale`) ; ne recalculez pas les cotes.

```
stage            padding-top = headroom (118 glace, 152 feu) ; reçoit mousemove/mouseleave
└ float          280 × 498 (flottement)
  └ tilt         280 × 498 (inclinaison au survol ; tout ce qui suit s'incline ensemble)
    ├ frame      inset 0, radius 12, overflow hidden, isolation isolate, fond oklch(0.2 0.014 60)
    │  1. art          image complète (x, y, scale) — z-index −1
    │  2. glow         si glow.layer = "inside" (glace)
    │  3. particules   arrière
    │  4. voile        linear-gradient(180deg, transparent 0 88px, oklch(0.12 0.01 60 / .75) 136px → 100%)
    │  5. holo         shiny seulement
    │  6. sweep        reflet qui balaie (dans un conteneur overflow hidden)
    │  7. contenu de la fiche (coût, titre, stats, effets… : inchangé, lot 9)
    │  8. glare        reflet du pointeur
    ├ pop            PNG détouré du haut du personnage, déborde au-dessus du cadre
    │  └ parts       (feu) tresse G, tresse D, yeux fermés — positionnées dans le repère du pop
    ├ sides          (feu) PNG des bouts qui passent devant les bords du cadre (y 0 → 105)
    ├ glow           si glow.layer = "outside" (feu)
    └ particules avant   conteneur de top −headroom à bottom 0
```
- Tous les calques décoratifs ont `pointer-events: none`.
- Le pop et l'illustration viennent de la même image, à la même échelle : ils se superposent au pixel près. Tout décalage casse l'effet.
- **Cadre** : normal `box-shadow: 0 0 0 2px <couleur du joueur>, 0 16px 36px oklch(0 0 0 / .5)`. Shiny : `0 0 0 2px oklch(0.86 0.13 85), 0 0 22px oklch(0.7 0.2 330 / .45), 0 16px 36px oklch(0 0 0 / .5)`.
- **Glow** : disque `size × size`, `radial-gradient(closest-side, couleur1, couleur2 60%, transparent)`, `mix-blend-mode: screen`, opacité de base .5. Couleurs dans `looks`.
- **Pop** : `filter` = `looks.<variante>.popFilter` (contour fin + halo + ombre).

## 3. Animations
Web Animations API (`element.animate`, `iterations: Infinity`), uniquement `transform`, `opacity` et `background-position`. Mêmes valeurs en normal et en shiny, sauf mention contraire. `n` = index de la carte affichée, pour décaler les cartes entre elles.

| Calque | Images clés | Durée · courbe | Notes |
| --- | --- | --- | --- |
| float | translateY 0 → −6px → 0 | 5600 ms · ease-in-out | delay −n × 1400 ms |
| respiration (art, pop, sides) | scale 1 → 1.02 → 1 | 4200 ms · ease-in-out | **les 3 démarrent au même `startTime`**. `transform-origin` = `breathAnchor` converti dans le repère de chaque calque (glace : art 167 276, pop 114.5 262 ; feu : art 240 393.6, pop 198 299.1, sides 198 150) |
| glow | opacity .3 → .85, scale .92 → 1.06, puis retour | 2600 ms · ease-in-out | |
| sweep | translateX −60 % → 60 % sur 28 % du cycle, puis pause | normal 6500 ms, shiny 4200 ms · ease-in-out | delay 1200 + n × 700 ms. Bande `linear-gradient(105deg …)` 200 % de large, `mix-blend-mode: screen`. Blanc : `transparent 44 %, oklch(1 0 0 / .2) 50 %, transparent 56 %`. Chaud : centre `oklch(0.95 0.09 70 / .24)`. Shiny : `transparent 38 %, oklch(0.9 0.14 350 / .4) 44 %, oklch(0.93 0.13 90 / .4) 50 %, oklch(0.9 0.12 170 / .4) 56 %, transparent 62 %` |
| tresse G | rotate −2.5° → 3° → −2.5° | 3400 ms · ease-in-out | origin 96.6 86.1 |
| tresse D | rotate 2.5° → −3° → 2.5° | 3900 ms · ease-in-out | delay −900 ms, origin 220.5 81.9 |
| yeux (clignement) | opacity 0 → 1 (25 %) → 1 (70 %) → 0 | 170 ms, une fois | boucle par `setTimeout` : prochain clignement dans 2400–5600 ms (aléatoire) ; 22 % de chances d'un double clignement 260 ms après ; premier à 1200 + n × 500 ms |
| holo (shiny) | background-position 0 % 50 % → 100 % 50 % → 0 % 50 % | 9000 ms · ease-in-out | `linear-gradient(115deg, oklch(0.8 0.16 350), oklch(0.88 0.14 85), oklch(0.85 0.13 165), oklch(0.78 0.13 240), oklch(0.75 0.17 305), oklch(0.8 0.16 350)) 0% 50% / 300% 300%`, `mix-blend-mode: color-dodge`, opacité .22 |
| particules | translate(0,0) → (drift, dist), opacité 0 → op (12 %) → op (82 %) → 0 | `dur` s · linear | delay = −delay (démarrage en cours de cycle). Rotation 180° pour les étincelles. Jeux de particules dans `overframes.json` (`particleSets`), générés une fois avec une graine fixe : glace normale = `snow`, feu normal = `embers`, **toute shiny = `sparks`** |

### Survol (inclinaison)
- Sur le `stage` : `px = (x − gauche) / 280`, `py = (y − haut − headroom) / 498`, bornés à [0, 1].
- tilt : `transform: perspective(1000px) rotateX((.5 − py) × 12deg) rotateY((px − .5) × 14deg)`, `transition: transform .35s cubic-bezier(.2,.8,.2,1)`.
- glare : opacité 1 (transition .3s), `radial-gradient(circle at px% py%, oklch(1 0 0 / .35), transparent 55%)`, `mix-blend-mode: soft-light`.
- holo (shiny) : opacité `.22 + .25 × |px − .5| × 2`.
- Sortie : tilt à 0, glare à 0, holo à .22.

## 4. Shiny
- Images `_shiny` (art, pop, sides, parts), glow et `popFilter` de `looks.shiny`.
- Particules `sparks`, holo, sweep arc-en-ciel à 4200 ms, cadre doré + halo rose.
- **Badge** à droite du titre de la fiche : hauteur 20 px, padding 0 8 px, radius 10 px, `linear-gradient(110deg, oklch(0.78 0.16 350), oklch(0.88 0.14 85), oklch(0.82 0.13 170))`, texte `oklch(0.22 0.03 330)` 800 11 px small-caps, letter-spacing .06em : « ★ Brillante ».
- **Shiny générique** (carte sans images `_shiny`) : tout ce qui précède, sur les images normales, avec le glow normal.

## 5. Performance et accessibilité
- Animer seulement les overframes **visibles** : `IntersectionObserver`, et pause quand l'onglet est caché (`visibilitychange`).
- `prefers-reduced-motion: reduce` ou réglage « Animations » coupé : rendu fixe (pop, cadre, holo statique, pas de particules, pas d'inclinaison).
- Toutes les animations sont annulées au démontage, y compris le `setTimeout` du clignement.
- Images chargées en différé, sauf pour la fiche affichée.

## 6. Les trois contextes
> **Mise à jour (lot 12 du handoff plateau)** : la fiche est désormais en haut de la colonne gauche. On réserve la hauteur du débordement au-dessus d'elle (`padding-top` = `headroom`) au lieu de déborder sur l'encadré adverse. Ça remplace le point 1 ci-dessous et le §7.

1. **Fiche au survol (colonne de gauche, 280 × 498)** : rendu complet, comme `2a`, `2c`, `2d` et `2e`. Le pop et les particules avant **débordent au-dessus de la fiche**, par-dessus l'encadré adverse, sans bloquer les clics. La colonne défile et couperait ce débordement : l'encadré adverse et la fiche doivent être **hors de la zone qui défile**, seul le journal défile.
2. **Tuiles du grimoire (format 3:4, lot 9)** : **pas de débordement**, les tuiles sont serrées dans une grille. Illustration avec le cadrage du lot 10, sans pop. Repos : fixe, sauf pour les shiny, qui gardent en permanence holo, sweep, cadre doré et un petit « ★ » à côté de l'icône de type. Survol : inclinaison, respiration et particules arrière (moitié du nombre).
3. **Aperçu plein écran** : rendu complet avec débordement, centré, `scale = min(1.8, (hauteur fenêtre − 80) / (498 + headroom))`. Fond `oklch(0.12 0.01 60 / .8)` + `backdrop-filter: blur(6px)`. Ouverture : clic sur la fiche, ou **clic droit** sur une tuile du grimoire (le clic gauche sert toujours à jouer la carte). Fermeture : Échap ou clic sur le fond. Pas d'animation d'ouverture.

## 7. À trancher avant de coder
- Fiche : si le débordement sur l'encadré adverse gêne, deux autres options. Réserver la hauteur au-dessus de la fiche (la fiche descend de 118 à 152 px), ou faire la fiche sans débordement et garder l'effet complet pour l'aperçu plein écran.
- Plateau : les jetons (gouttes) n'utilisent pas l'overframe. Un exemplaire shiny pourrait avoir un liseré arc-en-ciel sur sa goutte ; ce n'est pas dessiné.

## Assets (`assets/art/`)
| Fichier | Taille | Rôle |
| --- | --- | --- |
| `archer_glace.jpg` / `_shiny` | 1008 × 1792 | illustration |
| `archer_glace_buste.png` / `_shiny` | 710 × 337, transparent | pop |
| `archer_feu_v2.jpg` / `_shiny` | 1008 × 1792 | illustration |
| `feu2_pop.png` / `_shiny` | 908 × 369, transparent | pop |
| `feu2_tresse_g.png`, `feu2_tresse_d.png` / `_shiny` | 908 × 369, transparent | tresses (même cadrage que le pop) |
| `feu2_yeux_fermes.png` / `_shiny` | 180 × 88, transparent | paupières pour le clignement |
| `feu2_cotes.png` / `_shiny` | 908 × 250, transparent | bouts qui passent devant les bords du cadre |

**Pour une nouvelle carte**, l'artiste fournit : l'illustration, un PNG du haut du personnage détouré **à partir de la même image** (mêmes pixels, même échelle), et en option les pièces animées (même cadrage que le pop) et les versions `_shiny`. Il suffit ensuite d'ajouter une entrée dans `overframes.json` : x, y, scale, ancre de respiration, glow, jeu de particules.

## Fichiers
- `Fiches cartes.dc.html` : maquette de référence, section « Tour 2 » (cartes 2a, 2c, 2d, 2e ; 2b et 2f sont les mêmes cartes fixes). Logique : `startAnims()`, `mkMove()`, `mkLeave()`, `FLAKES`, `EMBERS`, `SPARKS`.
- `overframes.json` : les deux définitions et les jeux de particules, prêts à charger.
- `assets/art/` : les 16 images.
- `support.js` : nécessaire pour ouvrir la maquette, rien à reprendre.

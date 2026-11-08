# Handoff : zones de déplacement, d'attaque et de danger

## Vue d'ensemble
Le style actuel des cases de déplacement (aplat doré plein + bord épais) cache le sol, les mana zones et les cases
occupées. On le remplace par des **halos** translucides, et on ajoute deux informations : où le pion sélectionné peut
**attaquer**, et où l'**équipe adverse** peut l'atteindre.

Prototype de référence : page **« Déplacements discrets »** du projet de design (bouton « Recommandé »), source dans `reference/Deplacements discrets.dc.html` (voir `renderVals`, `reach`, `atkZone`). Il part de
Plateau 15 et ne touche qu'au calque des cases.

## Fidélité
**Haute fidélité** pour les couleurs, opacités et épaisseurs ci-dessous. Le calcul des zones du prototype est une
**approximation** : dans le jeu, utiliser les règles réelles de `movement.ts` et `combat.ts` (voir §2).

## 1. Code couleur

Les couleurs sont relatives au **pion sélectionné** : « moi » = son équipe, « ennemi » = l'autre équipe.
On n'utilise ni rouge ni bleu, réservés aux équipes (pions J1 rouges, J2 bleus), ni le doré des mana zones.

| Zone | Rendu | Valeur |
|---|---|---|
| Je peux **aller** | halo intérieur cyan | `box-shadow: inset 0 0 14px 0 rgba(80,225,255,.8)` |
| Je peux **attaquer** | halo intérieur orange | `box-shadow: inset 0 0 14px 0 rgba(255,145,30,.85)` |
| **Danger ennemi** (un ennemi peut y aller ou y taper) | contour violet de la zone + voile très léger | trait `3px rgba(190,100,255,.95)` ; voile `rgba(190,100,255,.08)` |

- Le **centre des cases reste transparent** : sol, mana zones, pions et obstacles restent lisibles.
- **Danger** = union, pour tous les pions adverses, de leurs cases de déplacement et de leurs cases d'attaque. Une seule
  couleur : on ne distingue pas « l'ennemi peut venir » de « l'ennemi peut taper ».
- Le **contour violet** n'est tracé que sur les côtés d'une case de danger qui donnent sur une case hors danger. Les
  cases de danger sont dessinées pleine largeur (72 px, rayon 0, au lieu de 68 px, rayon 6) pour que le trait soit
  continu d'une case à l'autre. Dans le prototype, chaque côté est un `inset` : haut `inset 0 3px 0 0`, bas
  `inset 0 -3px 0 0`, gauche `inset 3px 0 0 0`, droite `inset -3px 0 0 0`. En vue « Isométrique J2 », haut/bas et
  gauche/droite s'inversent (le plateau est tourné de 180°).
- Une case peut être à la fois cyan (ou orange) et dans la zone violette : on garde le halo **et** le contour. Lecture :
  « je peux y aller, mais je m'expose ».
- Ordre des couches sur une case (du dessus vers le dessous) : contour violet, anneau de survol, halo cyan/orange,
  liseré de grille.

### Survol
| Case survolée | Rendu |
|---|---|
| Déplacement | voile `rgba(80,225,255,.22)` + anneau `inset 0 0 0 5px rgba(200,245,255,.95)` |
| Attaque | voile `rgba(255,145,30,.2)` + anneau `inset 0 0 0 5px rgba(255,210,150,.9)` |
| Autre case jouable | inchangé (voile blanc `.14`, anneau blanc) |

- **Chemin** : au survol d'une case de déplacement, les cases traversées depuis le pion (départ et arrivée exclus)
  portent un petit point : `radial-gradient(circle, #fff 0 3px, rgba(120,205,255,.95) 3.5px 5.5px, rgba(10,20,40,.45) 6px 7.5px, transparent 8px)`.
  Il faut garder la case précédente de chaque case pendant le parcours en largeur (`prev`).
- Texte d'aide au survol d'une case de danger : « Zone de danger : un ennemi peut vous atteindre ici. »

### Légende
Panneau en bas à gauche : trois lignes (pastille + libellé) « Là où je peux aller », « Là où je peux attaquer »,
« Zone de danger ennemie (aller ou taper) », une ligne d'explication pour le cas superposé, et deux boutons :
**Menace ennemie** (affiche/masque le violet) et **Chemin au survol**.

## 2. Calcul des zones
- **Aller** : les cases d'arrêt valides de `movement.ts` pour le pion sélectionné (inchangé).
- **Attaquer** : les cases qu'il pourrait cibler depuis sa case **ou** depuis l'une de ses cases d'arrêt, hors cases de
  déplacement, hors alliés. Le prototype prend la distance de Manhattan ≤ portée et ignore la ligne de vue : **à
  remplacer par la fonction de ciblage de `combat.ts`** (X hautes, X basses et portée 2+, effet du Mage, etc.).
- **Danger** : même calcul pour chaque pion adverse, **avec ses propres** mouvement, portée et `vol`, puis union.
  Les cases occupées par les pions adverses eux-mêmes en sont exclues.
- Recalcul à chaque changement de sélection, de position ou d'état des pions ; pas à chaque image (mémoïser).

## 3. Questions à poser à l'utilisateur (ne pas trancher seul)
1. Le danger s'affiche-t-il seulement quand un pion est sélectionné, ou en permanence pendant mon tour ?
2. Le danger compte-t-il les sorts et effets des cartes en main de l'adversaire, ou seulement les pions sur le plateau ?
3. Cliquer une case orange (attaque) doit-il déplacer puis attaquer automatiquement, ou ne rien faire ?
4. Cliquer un pion ennemi : afficher ses zones en cyan/orange (vues « de son point de vue ») ?

## 4. Hors périmètre
- Le rendu des mana zones, des invocations, des pions et du sol ne change pas.
- La variante « 4 couleurs » du prototype sert seulement de comparaison : ne pas l'implémenter.

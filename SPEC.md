# Spécification MVP — TCG tactique (cartes + échecs)

Ce document est la référence pour implémenter le MVP. En cas de doute, demander plutôt que deviner.

## 1. Périmètre du MVP

**Dans le MVP**
- Jeu à 2 joueurs en local, sur le même écran (« hotseat »), dans le navigateur.
- Les deux joueurs utilisent le même grimoire de 25 cartes (section 6), ou chacun un deck pré-construit (§6 bis).
- Toutes les règles de la section 4.
- Une IA d'entraînement simple, pour tester le jeu seul (§7 bis).

**Hors MVP** (ne pas implémenter, mais ne pas bloquer leur ajout futur)
- Réseau / multijoueur en ligne, comptes, deckbuilding, collection. (Des decks pré-construits, choisis avant la partie, sont proposés : voir §6 bis.)
- Sorts d'invocateur (liste pas encore définie).
- Effets de terrain du plateau (hauteur, fosse) : tout est en plaine en v1. Les falaises, elles, font partie du MVP (voir §3 et §10).

## 2. Architecture

- **TypeScript**, **Vite**, **React** pour l'UI, **Vitest** pour les tests.
- **Moteur de règles pur**, sans aucune dépendance à l'UI, dans `src/engine/` :
  - `createGame(): GameState`
  - `getLegalActions(state): Action[]`
  - `applyAction(state, action): GameState` — déterministe, ne mute pas `state`, lève une erreur si l'action est illégale.
  - `getPlayerView(state, player): PlayerView` — retire les informations cachées (grimoire adverse). L'UI n'affiche que des `PlayerView`. C'est ce qui permettra plus tard un serveur qui fait autorité.
- **Cartes décrites en données** (`src/engine/cards.ts`) : stats + mots-clés + effets paramétrés. Pas de code spécifique par carte quand un mot-clé générique suffit.
- Chaque règle de la section 4 a au moins un test unitaire.

## 3. Plateau

Grille de 11 lignes × 9 colonnes. Coordonnées `(ligne, colonne)`, `(0,0)` en haut à gauche.

```
      c0 c1 c2 c3 c4 c5 c6 c7 c8
r0     .  .  .  1  1  1  .  .  .
r1     P  P  P  P  P  P  P  P  P
r2     P  P  P  P  E  P  P  P  P
r3     P  P  P  P  X  P  P  P  P
r4     P  P  P  P  X  P  P  P  P
r5     P  S  P  P  F  P  P  M  P
r6     P  P  P  P  X  P  P  P  P
r7     P  P  P  P  X  P  P  P  P
r8     P  P  P  P  R  P  P  P  P
r9     P  P  P  P  P  P  P  P  P
r10    .  .  .  2  2  2  .  .  .
```

| Symbole | Signification |
|---|---|
| `.` | Hors plateau (n'existe pas) |
| `X` | Case bloquée (infranchissable) |
| `P` | Plaine |
| `1` / `2` | Zone d'invocation du joueur 1 / joueur 2 (case jouable normale par ailleurs) |
| `E` | Mana zone « Écurie » (zone maison du J1) |
| `R` | Mana zone « Ferme » (zone maison du J2) |
| `F` | Mana zone « Forge » (centre) |
| `S` | Mana zone « Scierie » |
| `M` | Mana zone « Mine » |

Les mana zones sont des cases jouables normales. Toutes les distances sont orthogonales (pas de diagonale).

**Falaises** (bords infranchissables entre deux cases, voir §10) : la Scierie (lignes 4 à 6, colonnes 0 à 2) et la Mine (lignes 4 à 6, colonnes 6 à 8) sont entourées de falaises côté centre (colonnes 2|3 et 5|6), ainsi qu'en haut (lignes 3|4) et en bas (lignes 6|7), sauf au milieu (colonnes 1 et 7) : on y entre par le haut ou par le bas. La Mine est une zone fermée : même un monstre `vol` ne survole pas ses falaises, et aucune attaque ne les traverse.

### Carte de test « Champ de bataille » (11 × 11)

Proposée au lancement d'une partie, à côté du plateau classique. Mêmes symboles et mêmes règles ; `|` et `‾` marquent les falaises.

```
      c0 c1 c2 c3 c4 c5 c6 c7 c8 c9 c10
r0     1  1  P  P  P  X  P  P| P  P  P
r1     1  P  P  P  P  P  P  P  P  S  P
r2     P  P  E  P  P  P  P  P| P  P  P
                               ‾‾    ‾‾
r3     P  P  P  P  P  P  P  P  P  P  P
r4     P  P  P  P  X  P  X  P  P  P  P
r5     X  P  P  P  P  F  P  P  P  P  X
r6     P  P  P  P  X  P  X  P  P  P  P
r7     P  P  P  P  P  P  P  P  P  P  P
       ‾‾    ‾‾
r8     P  P  P| P  P  P  P  P  R  P  P
r9     P  M  P  P  P  P  P  P  P  P  2
r10    P  P  P| P  P  X  P  P  P  2  2
```

Un couloir libre (lignes 3 et 7, colonnes 3 et 7) sépare la Scierie et la Mine du centre : on peut longer leurs falaises pour aller d'une entrée à l'autre. La Scierie (en haut à droite) s'ouvre à gauche en ligne 1 et en bas en colonne 9 ; la Mine (en bas à gauche) en haut en colonne 1 et à droite en ligne 9. La carte est symétrique par rapport à la case (5, 5).

## 4. Règles

### 4.1 Mise en place
- J1 commence.
- Chaque joueur : 0 mana, 0 point de victoire (PV de victoire, noté **VP** dans le code pour éviter la confusion avec les points de vie), grimoire complet disponible.

### 4.2 Déroulé d'un tour
1. **Début de tour** du joueur actif :
   - Gagne 3 mana + 1 mana par mana zone qu'il contrôle (+ bonus éventuels : Autel de mana, Porte-étendard).
   - Gagne 1 VP par mana zone qu'il contrôle.
   - Au tout premier tour de J2 uniquement : +1 mana.
   - Ses monstres récupèrent toute leur mobilité, leur attaque et leur effet activé.
2. **Phase d'action**, dans l'ordre que le joueur veut, autant de fois que possible :
   - jouer une carte (invocation, sort, terrain) ;
   - déplacer un monstre ;
   - attaquer avec un monstre ;
   - utiliser l'effet activé d'un monstre.
3. **Fin de tour** : le joueur clique sur « Fin du tour ».

Le mana non dépensé est conservé d'un tour à l'autre, sans plafond.

### 4.3 Grimoire
- Toutes les cartes du grimoire sont jouables à tout moment pendant son tour, si on a le mana.
- Un même sort (même carte) ne se lance qu'une fois par tour : un second exemplaire attend le tour suivant. Les monstres et les terrains ne sont pas concernés.
- Une carte jouée est définitivement utilisée (pile « utilisées », publique).
- **Informations publiques** : cartes utilisées par chaque joueur, nombre de cartes restantes, mana, VP.
- **Information cachée** : le contenu du grimoire adverse.
- Hotseat : entre deux tours, afficher un écran « Passe l'écran au joueur X » qui masque tout jusqu'au clic.

### 4.4 Contrôle des mana zones
- Une zone est contrôlée par le joueur dont un monstre l'occupe.
- Sans monstre, elle est contrôlée par le joueur dont un terrain l'occupe.
- Sinon, elle est neutre.
- Le contrôle est évalué au début de chaque tour (section 4.2).

### 4.5 Invocation
- Payer le coût de la carte, poser le monstre sur une case d'invocation **libre** de son camp.
- La case d'un de ses terrains « Point d'invocation » (Zone d'invocation) est aussi une case d'invocation de son camp, tant qu'aucun monstre ne s'y trouve.
- L'effet « Invocation » (Invocateur) pose le monstre sur une case adjacente libre de la source, en payant aussi son coût (§5.4).
- Le monstre peut agir immédiatement (mobilité complète, attaque, effet).
- Occuper les cases d'invocation adverses est autorisé (stratégie de blocage).

### 4.6 Déplacement
- Déplacement orthogonal, 1 point de mobilité par case.
- On peut traverser ses alliés, pas les ennemis (monstres ou terrains), ni les cases `X` ou `.`.
- On ne peut pas terminer sur une case occupée.
- La mobilité peut être fractionnée : bouger, attaquer, puis rebouger avec ce qui reste.

### 4.7 Attaque
- Une attaque par monstre et par tour.
- Cible : une unité ennemie (monstre ou terrain) en ligne droite orthogonale, à une distance ≤ portée.
- Ligne de vue : les cases entre l'attaquant et la cible doivent exister, ne pas être `X`, et être vides.
- Si une case contient un monstre et un terrain, l'attaque touche le monstre ; le terrain n'est attaquable que seul.
- Dégâts = ATK de l'attaquant, retirés aux points de vie de la cible. Les dégâts restent.
- **Pas de riposte**, sauf mot-clé `riposte`.
- Points de vie ≤ 0 → l'unité est détruite. Détruire un **monstre** rapporte 1 VP au joueur qui l'a détruit (attaque, sort, effet ou riposte). Détruire un terrain ne rapporte rien.
- **Avancée** : si l'attaquant était adjacent et a détruit la cible, il peut immédiatement prendre sa place gratuitement (sans dépenser de mobilité). C'est optionnel.

### 4.8 Effets activés
- Utilisables une fois par tour, en payant leur coût en mana.
- N'utilisent pas l'attaque du monstre.

### 4.9 Terrains
- Se posent sur une mana zone occupée par un de ses propres monstres. Une case peut contenir un monstre et un terrain du même joueur.
- Le monstre peut ensuite partir ; le terrain reste et tient la zone.
- Un terrain n'a ni ATK ni mobilité. Les ennemis ne peuvent pas entrer sur sa case tant qu'il n'est pas détruit.

### 4.10 Victoire
- Le premier joueur à atteindre **20 VP** gagne immédiatement.
- Les valeurs (20 VP, 3 mana, +1 mana pour J2) sont des constantes dans `src/engine/config.ts`, pour pouvoir les ajuster facilement.

## 5. Lexique

Le vocabulaire des cartes : un mot = une notion, la même dans les textes de cartes, dans ce document et dans le code. Une carte s'écrit avec ces mots. Un mot absent du lexique, ou une phrase qui peut se lire de deux façons, appelle une question ; la réponse vient compléter le lexique. Le texte affiché sur les cartes en jeu est généré à partir des données du moteur : s'il diffère du texte voulu, c'est un malentendu à corriger.

### 5.1 Termes de base

| Terme | Code | Sens |
|---|---|---|
| Unité | `unit` | Un monstre ou un terrain posé sur le plateau. |
| Allié / ennemi | `side: ally` / `enemy` | Toujours un **monstre** (jamais un terrain), sauf mention contraire. |
| Coût | `cost` | Mana à payer pour jouer la carte. |
| ATK · PV · PV max | `atk` · `hp` · `maxHp` | PV = points de vie. Les points de victoire s'écrivent **VP** (`vp`). |
| Mobilité | `mobility` | Nombre de cases parcourues par tour, en orthogonal (§4.6). |
| Portée | `range` | Distance maximale d'une attaque ou d'un effet, **en ligne droite**, avec ligne de vue (§4.7). |
| Au contact | `contact` | À 1 case, en ligne droite (pas en diagonale). Attaques de portée 1, riposte, avancée, Trophée, Pillage. |
| Adjacent | `adjacent` | Une des **8 cases autour**, diagonales comprises (falaises : voir §10). |
| À N pas | `steps` | À N cases au plus en comptant un chemin orthogonal, en L possible, sans ligne de vue (Boule de feu). |
| Famille | `family` | Groupe de cartes nommé après le nom de la carte (« Arnold - Bodybuilder »). « Un allié bodybuilder » : un de ses monstres de la famille Bodybuilder ; « un allié archer » : un de ses monstres de la famille Archer. Familles : Bodybuilder, Archer, Dragon élémentaire (« dragons élémentaires »), Piège (« monstres piège ») (§10). |
| Devant · par derrière | `facing` | Un monstre regarde dans le sens de son dernier pas (§10). « Devant » : la case dans ce sens. « Par derrière » : l'attaquant frappe dans le sens où regarde sa cible. |

### 5.2 Écrire un effet

Un effet s'écrit **Déclencheur · Cible ou zone · Effet(s)**, avec une durée pour un statut. Il peut porter un nom (« Déflagration »), sans effet de règle. Une carte qui a plusieurs effets les sépare par « ; » (« Vol ; Actif (3 mana) · … »).

Exemple : « Actif (3 mana) · Déflagration · 3 cases devant · 2 dégâts + burn 1 pendant 1 tour ».

| Déclencheur | Code | Sens |
|---|---|---|
| Actif (N mana) | `activated` | Le joueur l'active, une fois par tour, en payant N mana. N'utilise pas l'attaque du monstre. |
| Passif | `passive` | Toujours en vigueur, sans coût. Les mots-clés (§5.6) sont des passifs. |
| Sort | `spell` | L'effet se résout quand la carte est jouée. |
| À l'attaque | `onHit` | Après les dégâts d'une attaque de ce monstre, sur sa cible. |
| Quand il détruit | `onKill` | Quand une attaque de ce monstre détruit un monstre. « Quand il détruit une unité » : un monstre ou un terrain ; l'effet s'applique au monstre lui-même. |
| Début de tour | `turnStart` | Au début de chaque tour de son camp, après les revenus et le burn (§10). |
| Aura | `aura` | Passif : tant qu'ils sont dans la zone de la source, les monstres visés ont le bonus (il se cumule avec celui d'une autre aura). Bonus d'ATK, de PV ou de mobilité (§10 pour les PV et la mobilité). |
| Piège | `trap` | Quand un monstre ennemi entre sur la case piégée (§10). |
| Passage | `passage` | Terrain, ou monstre (Golem de lave) : quand un monstre ennemi entre sur une case de sa zone, une fois par mouvement (§10). |

### 5.3 Cibles et zones

**Cible** : le joueur choisit un monstre.

| Terme | Code | Sens |
|---|---|---|
| un allié / un ennemi | `anywhere` | N'importe où sur le plateau. |
| … adjacent | `adjacent` | Sur une des 8 cases autour de la source. |
| … en ligne, portée N | `line`, `range` | Comme une attaque de portée N (ligne droite, ligne de vue). |
| … à N pas d'un de vos monstres | `nearOwnMonster`, `steps` | Voir « À N pas ». |
| un allié bodybuilder · un allié archer | `family` | Un de ses monstres de cette famille, n'importe où. |
| lui-même | `self` | Le monstre source (Dopage de Jean Bon). |
| une case adjacente libre | `emptyAdjacentCell` | Case adjacente jouable, sans unité (pose de piège, invocation, téléportation). |
| une case libre, rayon 2 | `emptyCell`, `adjacent2` | Case jouable sans unité ni case brûlée, parmi les « adjacents, rayon 2 » de la source (Lutin brasier). |

**Zone** : l'effet touche tous les monstres ennemis de la zone (jamais un terrain, un allié ou un monstre invisible pour le lanceur). Il n'est jouable que si au moins un ennemi s'y trouve.

| Terme | Code | Sens |
|---|---|---|
| 3 cases devant | `front3` | La case devant la source et ses deux voisines de côté (en diagonale de la source), si elles sont adjacentes. |
| Adjacents | `adjacent` | Les 8 cases autour de la source. |
| 3 cases en ligne, direction au choix | `line3` | Le joueur choisit une direction (haut, bas, gauche, droite) : les 3 cases en ligne droite à partir de la source, jusqu'à la première falaise ou case `X` (exclue). La source se tourne vers cette direction avant l'effet (un recul « vers l'avant » part donc dans ce sens). |
| adjacents, rayon 2 | `adjacent2` | Les cases adjacentes à la source, et les cases adjacentes à celles-ci (sans la source) : le carré 5 × 5 sur terrain dégagé ; falaises et cases `X` coupent la zone comme pour « adjacent ». |
| bodybuilders alliés adjacents | `adjacent`, `family` | Pour une aura ou un effet de début de tour : ses monstres de cette famille sur les 8 cases autour de la source (pas la source elle-même). |
| tous les monstres piège alliés | `allies`, `family` | Tous ses monstres de cette famille, où qu'ils soient, sans choix (Pénombre) ; jouable s'il en a au moins un. |

### 5.4 Effets

| Terme | Code | Paramètres | Sens |
|---|---|---|---|
| N dégâts | `damage` | `amount` | Retire N PV. |
| Soin N | `heal` | `amount` | Rend N PV, sans dépasser les PV max ; impossible sur une cible qui a tous ses PV. |
| Statut | `status` | `kind`, `amount`, `turns` | Pose un statut (§5 bis) pour une durée (§5.5). |
| Recul N | `push` | `distance`, `direction` (`chosen` · `forward`), `chooseDistance` | La cible recule de N cases au plus, et s'arrête avant le premier obstacle (case `X` ou `.`, case occupée, falaise). Direction : au choix du joueur, ou « vers l'avant » (le sens où regarde la source). « De 1 à N au choix » : le joueur choisit aussi la distance. |
| +N mobilité | `addMobility` | `amount` | Pour ce tour. |
| +A ATK · +P PV | `addStats` | `atk`, `hp` | Définitivement ; +P PV augmente aussi les PV max. |
| +N ATK (pour ce tour) | `addAtkThisTurn` | `amount` | Jusqu'à la fin du tour en cours. |
| +N portée (pour ce tour) | `addRangeThisTurn` | `amount` | Jusqu'à la fin du tour en cours : il attaque plus loin, avec les règles de tir habituelles (ligne droite, ligne de vue, falaises). Avec un bonus d'ATK, s'écrit d'un bloc : « +1 ATK +1 portée (pour ce tour) ». |
| ATK ×N (pour ce tour) | `multiplyAtkThisTurn` | `multiplier` | Son ATK du moment (bonus du tour compris, auras non comprises) est multipliée jusqu'à la fin du tour en cours. |
| +N VP · +N mana | `gainVp` · `gainMana` | `amount` | Pour le joueur de la source. |
| Piège | `placeTrap` | `effects` | Piège une case adjacente libre ; ses effets s'appliquent au monstre ennemi qui y entre (§10). |
| Case brûlée pendant N tours : effets | `burnCell` | `turns`, `effects` | La case visée brûle, visible des deux joueurs, pendant N tours du camp du lanceur (§5.5) ; chaque monstre ennemi qui y entre subit les effets, et la case reste (§10). |
| Évolution | `evolve` | — | Sacrifie la source pour invoquer à sa place un monstre de son grimoire qui en évolue, sans payer son coût ; le nouveau monstre n'agit pas ce tour. Pas le tour où la source est arrivée (§10). |
| Invocation | `summon` | — | Invoque sur la case visée un monstre de son grimoire, choisi par le joueur, en payant aussi son coût ; il peut agir aussitôt (§4.5). |
| Téléportation | `teleport` | — | Pose le monstre ciblé sur une case adjacente libre de la source, choisie par le joueur. Ce n'est pas un déplacement : il garde sa mobilité, son attaque et son orientation, même immobilisé ou stun. Il entre sur la case (pièges, Passage, §10). |

Plusieurs effets s'enchaînent avec « + », dans l'ordre écrit : « 2 dégâts + burn 1 ».

### 5.5 Durées

Un statut dure un nombre de tours propre à l'effet qui le pose. On compte les tours **du camp de l'unité touchée** ; le tour en cours ne compte pas.

| Terme | Code | Sens |
|---|---|---|
| pendant N tours | `turns: N` | Jusqu'à la fin du N-ième prochain tour de son camp. Burn N pendant 2 tours : 2 pertes de N PV, au début de ses 2 prochains tours. |
| jusqu'à son prochain tour | `turns: 0` | Jusqu'au début du prochain tour de son camp : pris pendant son propre tour, il dure le reste de ce tour, puis il est libre (filet du Poseur de piège, slow du Terrain piégé). |

Hors statuts : « +N mobilité », « +N ATK » et « +N portée » (pour ce tour) valent pour ce tour, « +A ATK +P PV » vaut définitivement.

### 5.6 Mots-clés

Un mot-clé est un raccourci : un nom, parfois un nombre, et une définition écrite avec les mots ci-dessus. Le nombre est propre à chaque carte.

| Mot-clé | Code | Définition |
|---|---|---|
| Riposte | `riposte` | Quand ce monstre est attaqué au contact et survit, il inflige son ATK à l'attaquant. Une fois par tour (§10). |
| Vol | `vol` | En se déplaçant, survole les cases `X` et les falaises de la Scierie (pas celles de la Mine, zone fermée), mais pas les ennemis ; ne termine jamais sur une case `X` ou `.` (§10). |
| Prime N | `prime` | Quand il détruit : +N VP, en plus du VP habituel. |
| Trophée N | `trophee` | Quand il détruit un monstre au contact : +N VP, en plus du VP habituel. |
| Pillage N | `pillage` | Quand il détruit un monstre au contact : +N mana. |
| Étendard N | `etendard` | La mana zone qu'il occupe rapporte +N mana. |
| Givre N | `givre` | À l'attaque : slow N pendant 1 tour (pas sur un terrain). Une autre durée s'écrit après : « Givre 1, 2 tours ». |
| Brûlure N | `brulure` | À l'attaque : burn N pendant 1 tour. Une autre durée s'écrit après : « Brûlure 1, 2 tours ». |
| Siège ×N | `siege` | Dégâts ×N contre un terrain. |
| Sournois +N | `sournois` | En attaquant un monstre par derrière : +N ATK pour cette attaque. |
| Assassin ×N | `assassin` | En attaquant un monstre par derrière : dégâts ×N. |
| Invisible N | `invisible` | Invisible pour l'adversaire tant qu'il est à plus de N cases de toute unité adverse et de toute case de la zone d'invocation adverse (§10). |
| Point d'invocation | `summonPoint` | Terrain : sa case est une case d'invocation de son camp, tant qu'aucun monstre ne s'y trouve (§4.5). |

### 5.7 Conventions du code

- Un paramètre a toujours le même nom : une quantité `amount`, une portée `range`, une distance en pas `steps`, un recul `distance`, un multiplicateur `multiplier`, une durée de statut `turns`.
- Les nombres d'une carte sont dans ses données, pas dans des constantes globales ; `config.ts` ne garde que les règles générales (20 VP, 3 mana par tour…).
- Les noms propres du jeu (mots-clés, statuts, cartes, mana zones) gardent le mot français, sans accent (`immobilise`, `brulure`) ; les notions techniques sont en anglais (`damage`, `heal`, `push`).
- Un effet sans nombre (stun, immobilisé, Vol, Riposte) n'a pas de paramètre `amount`.

## 5 bis. Statuts

Posés sur une unité par un effet, pour une durée (§5.5).

| Statut | Code | Effet |
|---|---|---|
| Stun | `stun` | La cible ne peut plus faire aucune action : ni déplacement, ni attaque, ni effet actif, ni riposte. |
| Slow N | `slow` | La mobilité de la cible est réduite de N. |
| Immobilisé | `immobilise` | La cible ne peut plus bouger (ni avancer après une attaque), mais peut attaquer et activer ses effets. |
| Burn N | `burn` | La cible perd N PV au début de chaque tour affecté. |
| Requiem N | `requiem` | La cible meurt au début du N-ième prochain tour de son camp, avant tout le reste. Personne ne gagne de VP. |
| Invisible N | `invisible` | Comme le mot-clé Invisible N (§5.6), pour la durée du statut (Pénombre). |

- Un statut disparaît au début du tour qui suit son échéance (§5.5), avant tout le reste (revenus, burn, mobilité). Pendant N tours, il touche chacun des N prochains tours du camp de l'unité.
- Les statuts du même type se cumulent : deux burn 1 font perdre 2 PV, deux slow 1 retirent 2 de mobilité.
- Un monstre stun ou immobilisé perd aussitôt sa mobilité restante. Au début de son tour, sa mobilité est celle de sa carte moins ses slow, ou 0 s'il est stun ou immobilisé.
- Un slow pris pendant le tour du camp de l'unité réduit aussitôt sa mobilité restante, sans descendre sous 0 (Terrain piégé).
- Sur un terrain, seul burn s'applique.
- Requiem n'a pas d'autre durée que son N : « requiem 2 » posé pendant son tour, le monstre joue encore ce tour et son prochain tour, puis meurt au début du suivant.

## 6. Grimoire de test (25 cartes)

Les tableaux de cartes (§6, §6 bis, §6 ter) s'écrivent avec le lexique (§5). Un test compare chaque ligne aux données du moteur (coût, stats, colonne « Effet ») : une carte modifiée ici doit l'être aussi dans `src/engine/cards.ts`, et inversement.

Les 20 cartes ci-dessous, plus les 5 cartes communes (§6 ter) en 1 exemplaire : c'est le deck Classique.

### Monstres (14)

| Carte | Qté | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|---|
| Éclaireur | 2 | 1 | 1 | 1 | 3 | 1 | — |
| Milicien | 2 | 2 | 2 | 3 | 2 | 1 | — |
| Archer | 2 | 2 | 2 | 1 | 2 | 2 | — |
| Chaman | 1 | 2 | 1 | 3 | 2 | 1 | Actif (1 mana) · un allié adjacent · soin 2 |
| Gardien | 1 | 3 | 1 | 6 | 1 | 1 | Riposte |
| Chevalier | 1 | 3 | 3 | 4 | 3 | 1 | — |
| Chasseur de primes | 1 | 3 | 3 | 2 | 3 | 1 | Prime 1 |
| Porte-étendard | 1 | 3 | 2 | 3 | 2 | 1 | Étendard 1 |
| Mage | 1 | 4 | 3 | 3 | 2 | 2 | Actif (2 mana) · un ennemi en ligne, portée 2 · 2 dégâts |
| Golem | 1 | 4 | 4 | 7 | 2 | 1 | — |
| Dragonnet | 1 | 6 | 5 | 6 | 4 | 1 | Vol |

### Sorts (4)

| Carte | Coût | Effet |
|---|---|---|
| Boule de feu | 2 | Un ennemi à 3 pas d'un de vos monstres · 2 dégâts |
| Charge | 1 | Un allié · +2 mobilité (pour ce tour) |
| Bourrasque | 2 | Un ennemi · recul 2, direction au choix |
| Bénédiction | 1 | Un allié · +1 ATK +1 PV (définitivement) |

### Terrains (2)

| Carte | Coût | PV | Effet |
|---|---|---|---|
| Autel de mana | 2 | 1 | La zone rapporte 2 mana au lieu de 1 (le VP reste à 1) |
| Bastion | 2 | 10 | — |

## 6 bis. Decks pré-construits

Chaque joueur choisit son deck avant la partie, parmi : **Classique** (le grimoire de test du §6), **Archers**, **Pièges**, **Dragons**, **Bodybuilder** et **Sorciers du feu**. Pas de deckbuilding. Chaque deck fait 25 cartes, 3 exemplaires au plus d'une même carte : ses cartes propres, un complément de cartes du grimoire de test (§6) et des cartes communes (§6 ter), avec les quantités de sa composition ci-dessous (tableau « Composition » du doc « Cartes du TCG »).

### Deck Archers

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Archer léger | 1 | 1 | 3 | 5 | 2 | Trophée 1 |
| Archer lourd | 3 | 3 | 3 | 3 | 2 | Pillage 1 |
| Archer de glace | 3 | 2 | 3 | 3 | 2 | Givre 1 |
| Archer du feu | 3 | 2 | 3 | 3 | 2 | Brûlure 1 |
| Trébuchet | 5 | 4 | 1 | 2 | 5 | Siège ×2 |

Les 4 archers sont de la famille Archer ; le Trébuchet n'en est pas.

| Carte | Coût | Effet |
|---|---|---|
| Flèche divine | 2 | Un allié archer · +1 ATK +1 portée (pour ce tour) |

Composition (25) : Archer léger ×3, Archer lourd ×3, Archer de glace ×3, Archer du feu ×3, Trébuchet ×2, Flèche divine ×1 ; complément : Boule de feu, Charge, Bourrasque, Bénédiction, Bastion (×1) ; communes : Invocateur, Téléporteur, Terrain drainant, Terrain piégé, Zone d'invocation (×1).

### Deck Pièges

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Poseur de piège | 1 | 1 | 1 | 7 | 1 | Actif (1 mana) · piège une case adjacente libre · immobilisé jusqu'à son prochain tour |
| Farceur | 2 | 2 | 1 | 6 | 1 | Invisible 2 ; Sournois +1 |
| Poseur de bombe | 1 | 2 | 1 | 7 | 1 | Actif (2 mana) · piège une case adjacente libre · 3 dégâts |
| Clown assassin | 4 | 2 | 2 | 7 | 1 | Assassin ×3 |

Les 4 monstres sont de la famille Piège (« monstres piège »).

| Carte | Coût | Effet |
|---|---|---|
| Pénombre | 5 | Tous les monstres piège alliés · invisible 2 pendant 1 tour |

Composition (25) : Poseur de piège ×3, Farceur ×3, Poseur de bombe ×3, Clown assassin ×3, Pénombre ×2 ; complément : Boule de feu, Charge, Bourrasque, Bénédiction, Autel de mana (×1) ; communes : Terrain piégé ×2, Zone d'invocation ×2, Invocateur, Terrain drainant (×1), pas de Téléporteur.

### Deck Dragons

| Carte | Qté | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|---|
| Jeune dragon élémentaire | 3 | 2 | 3 | 2 | 4 | 1 | Actif (2 mana) · Évolution |
| Dragon élémentaire de feu | 2 | 7 | 5 | 5 | 5 | 1 | Vol ; Actif (3 mana) · Déflagration · 3 cases devant · 2 dégâts + burn 1 pendant 1 tour |
| Dragon élémentaire d'eau | 2 | 7 | 4 | 7 | 4 | 1 | Vol ; Actif (3 mana) · Raz de marée · 3 cases en ligne, direction au choix · stun pendant 1 tour |
| Dragon élémentaire de vent | 2 | 7 | 4 | 4 | 7 | 1 | Vol ; Actif (3 mana) · Vent violent · 3 cases en ligne, direction au choix · recul de 1 à 3 au choix, vers l'avant |
| Dragon élémentaire de terre | 2 | 7 | 6 | 5 | 4 | 1 | Vol ; Actif (3 mana) · Tremblement de terre · adjacents, rayon 2 · 3 dégâts |
| Dragon élémentaire - Origine | 1 | 10 | 7 | 7 | 7 | 1 | Vol ; Aura · dragons élémentaires alliés adjacents · +1 ATK +1 PV +1 mobilité |

Les 6 dragons (Jeune dragon et Origine compris) sont de la famille Dragon élémentaire. Origine ne s'obtient pas par évolution.

Un dragon élémentaire s'invoque normalement pour 7 mana, ou par l'évolution d'un Jeune dragon (§5.4, §10) : le Jeune dragon se sacrifie et le dragon choisi apparaît à sa place, sans payer son coût.

Composition (25) : Jeune dragon élémentaire ×3, chaque dragon élémentaire ×2, Origine ×1 ; complément : Boule de feu ×2, Charge ×3, Autel de mana ×2, Bénédiction ×1 ; communes : Invocateur, Téléporteur, Terrain drainant, Terrain piégé, Zone d'invocation (×1).

### Deck Bodybuilder

Mécanique : peu de mobilité, mais beaucoup d'ATK et de PV. Les 4 monstres sont de la famille Bodybuilder.

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Jeune Gomuscu | 2 | 2 | 2 | 3 | 1 | Quand il détruit une unité · +1 ATK +1 PV (définitivement) |
| Jean Bon | 3 | 5 | 3 | 3 | 1 | Actif (2 mana) · Dopage · lui-même · +2 ATK (pour ce tour) + burn 1 pendant 2 tours |
| Arnold | 7 | 7 | 5 | 3 | 1 | Aura · bodybuilders alliés adjacents · +2 ATK |
| Ki né | 3 | 2 | 3 | 4 | 1 | Début de tour · bodybuilders alliés adjacents · soin 1 |

| Carte | Coût | Effet |
|---|---|---|
| Seringue | 2 | Un allié bodybuilder · ATK ×2 (pour ce tour) + requiem 2 |

Composition (25) : Jeune Gomuscu ×3, Jean Bon ×3, Arnold ×3, Ki né ×3, Seringue ×2 ; complément : Charge ×3, Boule de feu, Bénédiction, Bastion (×1) ; communes : Invocateur, Téléporteur, Terrain drainant, Terrain piégé, Zone d'invocation (×1).

### Deck Sorciers du feu

Les 4 monstres sont de la famille Sorcier du feu. Brûlure 1, 2 tours : à l'attaque, la cible est burn 1 pendant 2 tours.

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Apprenti | 2 | 1 | 3 | 4 | 2 | Brûlure 1, 2 tours |
| Lutin brasier | 4 | 2 | 4 | 4 | 2 | Brûlure 1, 2 tours ; Actif (1 mana) · une case libre, rayon 2 · case brûlée pendant 2 tours : 1 dégât + burn 1 pendant 1 tour |
| Archimage | 6 | 3 | 5 | 4 | 2 | Brûlure 1, 2 tours ; Actif (1 mana) · adjacents · burn 2 pendant 2 tours |
| Golem de lave | 5 | 2 | 8 | 2 | 1 | Passage · adjacents · burn 1 pendant 1 tour |

Composition (25, proposée) : Apprenti ×3, Lutin brasier ×3, Archimage ×2, Golem de lave ×3 ; complément : Boule de feu ×2, Charge ×2, Gardien, Chevalier, Bénédiction, Autel de mana, Bastion (×1) ; communes : Invocateur, Téléporteur, Terrain drainant, Terrain piégé, Zone d'invocation (×1).

## 6 ter. Cartes communes

Elles complètent les decks, chacun avec ses propres quantités (composition du §6 bis).

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Invocateur | 4 | 1 | 3 | 3 | 2 | Actif (1 mana) · une case adjacente libre · invocation |
| Téléporteur | 4 | 1 | 3 | 3 | 2 | Actif (1 mana) · un allié · téléportation sur une case adjacente libre |

| Carte | Coût | PV | Effet |
|---|---|---|---|
| Terrain drainant | 1 | 4 | Passage · adjacents · 1 dégât |
| Terrain piégé | 1 | 4 | Passage · adjacents · slow 1 jusqu'à son prochain tour |
| Zone d'invocation | 1 | 4 | Point d'invocation |

## 7. Interface (minimale)

- Plateau au centre, cases cliquables, unités affichées avec ATK / PV actuels / mobilité restante.
- Panneau du joueur actif : mana, VP, grimoire (cartes jouables en surbrillance, coût visible).
- Panneau adverse : mana, VP, cartes utilisées, nombre de cartes restantes.
- Sélection d'un monstre → surbrillance des cases atteignables et des cibles attaquables.
- Sélection d'un monstre adverse → surbrillance des cases qu'il pourra atteindre à son prochain tour (mobilité complète moins le givre, plateau actuel).
- Sélection d'une carte → surbrillance des cibles valides.
- Journal des actions.
- Bouton « Fin du tour » et écran de passage hotseat.
- Écran de victoire.

## 7 bis. IA d'entraînement

Pour tester le jeu seul : au lancement d'une partie, « J2 joué par : l'IA ». Pas de niveau de difficulté.

- L'écran montre toujours la vue de J1 ; pas d'écran de passage. Pendant le tour de l'IA, on la regarde jouer : une action à la fois, animée, avec une courte pause entre deux.
- À chaque action, l'IA essaie toutes ses actions légales et joue celle qui améliore le plus la position ; quand plus rien ne l'améliore, elle finit son tour. Elle voit deux coups à l'avance pour un même monstre : une action vaut la position après elle, ou après la meilleure action suivante de ce monstre (un sort ou un effet qui le renforce puis son attaque, un déplacement ou une invocation puis une attaque, une attaque puis un repli). Elle ne compte pas comme menacées les unités que l'adversaire ne voit pas (Farceur, Pénombre).
- Effets actifs : un effet inutilisé est perdu pour le tour, une carte reste au grimoire. L'IA pose donc ses monstres et terrains après ses déplacements, attaques et effets utiles, et un effet utile passe avant un monstre ou un terrain qui lui prendrait son mana. Après un déplacement, elle regarde aussi l'effet que le monstre pourrait lancer de sa nouvelle case (Mage, Chaman, dragons). Les sorts se jouent quand ils sont les meilleurs. La position se juge sur les VP, la valeur des unités, les mana zones tenues, la marche vers les zones à prendre, ce que chaque camp risque de perdre au prochain tour adverse, et un peu le mana en réserve.
- Elle ne triche pas : elle ne voit ni les monstres invisibles adverses, ni les pièges adverses, ni le grimoire adverse.
- Elle est dans `src/ai/`, hors du moteur, qu'elle utilise comme l'interface.

## 8. Ordre d'implémentation conseillé

Une étape à la fois, tests verts avant de passer à la suivante.

1. Types (`GameState`, `Unit`, `Card`, `Action`), plateau, `createGame`.
2. Invocation et déplacement (sections 4.5, 4.6).
3. Attaque, destruction, VP, avancée (section 4.7).
4. Tours, mana, contrôle des zones, victoire (sections 4.2, 4.4, 4.10).
5. Mots-clés, effets activés, sorts, terrains (sections 4.8, 4.9, 5, 6).
6. `getPlayerView` et interface.
7. Écran de passage hotseat.

## 9. Prévu pour plus tard (ne pas implémenter)

- Terrains « hauteur » (+1 portée) autour de la Scierie et « fosse » (pas de tir entrant) autour de la Mine. Les falaises qui les entourent sont déjà dans le MVP.
- Sorts d'invocateur : 2 par joueur, choisis avant la partie, cachés jusqu'à utilisation, utilisables une fois.
- Multijoueur en ligne avec serveur qui fait autorité, basé sur le même moteur.
- Règle de priorité entre effets qui se déclenchent en même temps. En attendant : sur une case où entre un monstre, les pièges de la case passent avant les terrains « Passage » (§10).
- Plusieurs cartes de plateau. (Une deuxième carte de test, « Champ de bataille » 11 × 11, est déjà jouable : voir §3.)

## 10. Clarifications validées

Réponses aux questions posées pendant le développement. Elles font autorité au même titre que le reste du document.

- **§4.1 / §4.2 — Premier tour de J1** : le début de tour s'applique dès le tour 1 ; J1 commence donc avec 3 mana.
- **§4.6 — Unités alliées** : on peut traverser les cases occupées par ses propres monstres **et** terrains. On ne peut pas s'arrêter sur une case qui contient un monstre. On peut s'arrêter sur une case qui ne contient qu'un terrain allié.
- **§4.9 — Terrains** : on ne peut pas poser deux terrains sur la même mana zone.
- **§5 / §6 — Autel de mana + `etendard`** : les bonus se cumulent. Un Porte-étendard sur la case de son propre Autel de mana fait rapporter 3 mana à la zone (2 grâce à l'Autel, +1 grâce à l'étendard).
- **§6 — Chaman et Mage** : « un allié » / « un ennemi » désigne un monstre. Un terrain n'est pas un monstre : bien différencier les types de cartes.
- **§6 — Chaman** : on ne peut pas soigner un allié qui a déjà tous ses PV.
- **§6 — Boule de feu** : « 3 cases max (distance orthogonale) » = 3 pas au maximum depuis un de ses monstres, chemin en L possible, sans ligne de vue.
- **§6 — Bourrasque** : un terrain du camp du monstre poussé n'arrête pas le recul ; le monstre peut finir dessus ou le traverser, comme pour un déplacement. La carte ne peut être jouée que dans une direction où le monstre recule d'au moins une case.
- **§5 — `riposte`** : ne se déclenche que contre une attaque, pas contre un effet activé (par exemple celui du Mage) ni contre un sort. Une seule riposte par tour : seule la première attaque adjacente du tour la déclenche.
- **§5 — `vol`** : survole uniquement les cases X ; les monstres et terrains ennemis le bloquent comme n'importe quel monstre (la §5 disait d'abord « traverse les ennemis », elle a été corrigée). `vol` ne joue que quand le monstre se déplace lui-même : poussé par Bourrasque, il s'arrête avant une case X comme les autres.
- **§3 — Falaises** : une falaise ne se franchit pas en se déplaçant, sauf avec `vol` qui survole celles de la Scierie. La **Mine** est une zone fermée : on n'y entre et on n'en sort que par ses ouvertures, même avec `vol`, et ses falaises coupent la ligne de vue de toutes les attaques et de l'effet du Mage, même au contact. Celle de la **Scierie** laisse passer les tirs de portée 2 ou plus (Archer, Mage, effet du Mage), même sur une cible juste derrière ; un monstre de portée 1 ne frappe pas à travers. Le soin du Chaman (portée 1, adjacent) ne passe aucune falaise. La Boule de feu (3 pas sans ligne de vue) les ignore. Toute falaise arrête le recul de Bourrasque, y compris pour un monstre `vol`. Les effets de hauteur et de fosse ne sont pas calculés en v1.
- **§6 bis — `trophee` / `pillage`** : « adjacent » = au contact au moment de l'attaque ; seule l'attaque compte (pas les sorts ni les effets).
- **§6 bis — `givre`** : pose slow 1 pendant 1 tour, compté en tours du camp de la cible (§5.5) ; il se cumule ; sans effet sur un terrain.
- **§6 bis — `brulure`** : pose burn 1 pendant 1 tour, compté en tours du camp de la cible (§5.5) ; la perte de PV a lieu au début de chaque tour affecté (après ses revenus) ; elle se cumule ; les terrains brûlent aussi ; une destruction rapporte le VP au joueur de l'archer.
- **§5 bis — Statuts** : un monstre stun ne riposte pas. Le filet du Poseur de piège immobilise jusqu'au début du prochain tour du monstre : pris pendant son propre tour, il ne bouge plus de ce tour et il est libre au suivant.
- **§6 bis — Trébuchet** : portée 5 avec les règles de tir habituelles ; il passe donc la falaise de la Scierie.
- **§6 bis — Pièges** : effet activé, une fois par tour, sur une case adjacente (une des 8 cases autour, voir « Adjacent ») jouable et sans unité. Un piège est caché à l'adversaire (ni sur le plateau, ni dans le journal, ni dans ses actions possibles), ne sert qu'une fois et disparaît au début du prochain tour de son poseur, même si ce dernier est mort. Il se déclenche quand un monstre ennemi entre sur sa case : en se déplaçant (même s'il ne fait que passer), poussé par Bourrasque, en avançant après une attaque ou en y étant invoqué. `vol` n'évite pas les pièges : un monstre volant les déclenche comme les autres, en se déplaçant comme en étant poussé. Après un piège à PV, le monstre continue s'il survit ; une destruction rapporte 1 VP au poseur.
- **§4.6 — Chemin** : le joueur peut choisir son chemin case par case. Sans chemin précisé, le moteur prend un des plus courts, celui que l'interface montre au survol avant le clic.
- **§6 bis — Orientation** : un monstre regarde dans le sens de son dernier pas (déplacement ou avancée ; un recul ne la change pas). Tant qu'il n'a pas bougé, il regarde vers le camp adverse : vers le bas pour J1, vers le haut pour J2. « Par derrière » = l'attaquant frappe dans le sens où regarde la cible. Les bonus d'ATK sont triplés aussi ; pas de bonus contre un terrain.
- **§3 — « Zone maison »** (Écurie, Ferme) : simple nom, sans effet de règle.
- **§5 / §6 bis — `invisible` (Farceur)** : le Poseur de piège a repris l'ancien effet du Farceur (piège qui immobilise) ; le Farceur devient passif. Il est invisible pour l'adversaire tant qu'aucune unité adverse (monstre ou terrain) ni aucune case de la zone d'invocation adverse n'est à 2 cases ou moins (distance orthogonale) : il ne peut donc jamais bloquer une invocation sans être vu. Invisible, il n'apparaît pas dans la vue adverse ni dans le journal (ses déplacements et son invocation n'y donnent pas de case), et l'adversaire ne peut ni l'attaquer ni le viser par un sort ou un effet. Le contrôle d'une mana zone qu'il occupe reste public. Il occupe quand même sa case : un déplacement adverse qui y entrerait s'arrête sur la dernière case du chemin où il pouvait s'arrêter, sans plus de mobilité ce tour (les pièges déjà traversés restent déclenchés) ; un recul de Bourrasque s'arrête avant lui ; un tir qui le traverse est arrêté (l'attaque est utilisée, sans dégâts). Dans ces cas il se révèle jusqu'à la fin du tour en cours.
- **§5 — `sournois` (Farceur)** : « par derrière » comme pour `assassin` (l'attaquant frappe dans le sens où regarde la cible). Le bonus s'ajoute à l'ATK actuelle (Bénédiction comprise), seulement contre un monstre. Si une carte avait `sournois` et `assassin`, le +1 s'appliquerait avant le ×3.
- **§6 bis — Évolution (Jeune dragon élémentaire)** : effet actif, 2 mana, une fois par tour, mais pas le tour où le Jeune dragon est arrivé sur le plateau. Le joueur choisit un dragon élémentaire de son grimoire : la carte passe dans sa pile « utilisées » sans que ses 7 mana soient payés. Le Jeune dragon est sacrifié (il quitte le plateau sans être détruit : pas de VP) et le dragon apparaît sur sa case, dans le même sens ; il ne peut ni bouger, ni attaquer, ni activer son effet ce tour-là. Ses statuts ne passent pas au dragon.
- **§6 bis — Zones des dragons** : « les 3 cases de devant » (Déflagration) = la case devant le dragon (dans le sens où il regarde) et ses deux voisines de côté (en diagonale du dragon) ; seules comptent les cases adjacentes au sens ci-dessous (falaises et cases X). « 3 cases en ligne, direction au choix » (Raz de marée, Vent violent) = le joueur choisit une des 4 directions, proposée seulement si un ennemi s'y trouve ; la zone est faite des 3 cases en ligne droite depuis le dragon, et s'arrête avant la première falaise ou case X ; les monstres ne l'arrêtent pas. Le dragon se tourne vers la direction choisie. « Adjacents, rayon 2 » (Tremblement de terre) = les cases adjacentes au dragon et les cases adjacentes à celles-ci : le carré 5 × 5 sur terrain dégagé, coupé par les falaises et les cases X comme « adjacent ». Seuls les monstres ennemis sont touchés (jamais un terrain, jamais un allié, jamais un monstre invisible pour le lanceur). L'effet n'est jouable que si au moins un ennemi est dans la zone.
- **§6 bis — Effets des dragons** : burn 1 (Déflagration) et stun (Raz de marée) durent 1 tour de la cible (§5.5). Vent violent : le joueur choisit la direction puis la distance (1, 2 ou 3) ; chaque ennemi de la ligne recule dans cette direction (le sens où regarde désormais le dragon), en s'arrêtant avant le premier obstacle, comme avec Bourrasque (pièges déclenchés compris). Le plus éloigné du dragon recule en premier, pour ne pas bloquer les autres.
- **§10 — « Adjacent »** : les 8 cases autour d'un monstre, diagonales comprises (soin du Chaman, pose des pièges, Tremblement de terre, zone de devant des dragons). Une case X ou hors plateau n'est jamais adjacente. Une falaise sépare : une case orthogonale derrière une falaise n'est pas adjacente ; une case en diagonale l'est si au moins un des deux chemins en L qui y mènent passe (case de coin jouable, aucune falaise sur le chemin). Les attaques, la riposte, l'avancée, `trophee` et `pillage` restent « au contact » : en ligne droite, à 1 case.
- **§7 — Menace adverse au survol** : hachures orange sur les cases où le monstre adverse pourra aller à son prochain tour ; hachures rouges sur les autres cases qu'il pourra frapper depuis sa case ou l'une d'elles (portée et ligne de vue de son attaque), y compris celles de tes monstres.
- **§5.5 — Durée des statuts** : elle est propre à chaque effet et se compte en tours du camp de l'unité touchée (le tour en cours ne compte pas) : « pendant N tours ». Le filet du Poseur de piège garde sa durée courte, « jusqu'à son prochain tour ».
- **§7 — Vue isométrique et rivière (handoff V5)** : la vue isométrique n'existe que pour le Champ de bataille (11 × 11), le plateau de la maquette ; sur le plateau classique, seules les vues Dessus et Inclinée sont proposées. Sur le Champ de bataille, 4 cases X — (4, 6), (6, 4), (5, 0), (5, 10) — sont dessinées en rivière dans toutes les vues : c'est un rendu seulement, elles restent des cases bloquées.
- **§6 ter — Passage (Terrain drainant, Terrain piégé)** : la zone est formée des 8 cases adjacentes au terrain (voir « Adjacent ») ; « les 2 cases adjacentes » du Terrain piégé désignent ces mêmes 8 cases. L'effet touche le monstre ennemi qui entre sur une case de la zone, en se déplaçant, poussé, en avançant après une attaque, invoqué ou téléporté (volant et invisible compris), après les pièges de cette case. Il se déclenche **une fois par mouvement** et par terrain, même si le monstre traverse plusieurs cases de la zone ; un nouveau déplacement le déclenche à nouveau. Une destruction rapporte 1 VP au propriétaire du terrain.
- **§6 ter — Terrain piégé** : le monstre qui entre est slow 1 jusqu'à son prochain tour ; il perd aussitôt 1 de mobilité restante, pour ce tour seulement. Les déplacements proposés en tiennent compte (entrer dans la zone coûte 1 mobilité de plus, une fois par déplacement). Pris pendant le tour adverse (recul), le slow ne retire rien.
- **§6 ter — Invocateur** : effet actif, 1 mana, plus le coût du monstre invoqué ; n'importe quel monstre de son grimoire, sur une case adjacente libre (sans unité). Comme une invocation normale, le monstre peut agir aussitôt ; il entre sur sa case (pièges, Passage).
- **§6 ter — Téléporteur** : un allié n'importe où sur le plateau, sauf le Téléporteur lui-même, même immobilisé ou stun ; il est posé sur une case adjacente libre du Téléporteur. Il garde sa mobilité restante, son attaque et son orientation ; son arrivée est une entrée sur la case (pièges, Passage).
- **§6 ter — Zone d'invocation** : terrain de coût 1 (le « coût d'activation » est le coût de la carte). Sa case devient une case d'invocation de son camp ; on y invoque si aucun monstre ne s'y trouve, le monstre partageant la case avec son terrain.
- **§6 bis — Cartes communes** : Invocateur, Téléporteur, Terrain drainant, Terrain piégé et Zone d'invocation complètent les decks ; leurs quantités varient d'un deck à l'autre (0 à 3), comme celles du complément, selon la composition du deck (25 cartes).
- **§6 bis — Flèche divine** (deck Archers) : sort à 2 mana sur un de ses archers, c'est-à-dire un monstre de la famille Archer : Archer léger, Archer lourd, Archer de glace, Archer du feu (ni le Trébuchet, ni l'Archer du grimoire de test, ni un archer adverse). +1 ATK et +1 portée jusqu'à la fin du tour : une portée 2 devient 3, avec les règles de tir habituelles. Comme tout sort, une fois par tour.
- **§6 bis — Deck Bodybuilder** : « Bodybuilder » est une famille (§5.1), pas une partie du nom de la carte.
- **§6 bis — Jean Bon, Dopage** : effet actif sur lui-même : +2 ATK pour ce tour, et Jean Bon est burn 1 pendant ses 2 prochains tours.
- **§6 bis — Ki né** : au début de chacun des tours de son camp, après les revenus et le burn, chaque bodybuilder allié adjacent (pas Ki né lui-même) récupère 1 PV, sans dépasser ses PV max.
- **§6 bis — Arnold** : son aura donne +2 ATK aux bodybuilders alliés adjacents (pas à lui-même) tant qu'ils le restent : à l'attaque, à la riposte et dans les dégâts affichés. Deux Arnold se cumulent (+4), et deux Arnold côte à côte se donnent +2 l'un à l'autre.
- **§6 bis — Jeune Gomuscu** : +1 ATK et +1 PV (PV max compris), définitivement, chaque fois que son attaque détruit un monstre ou un terrain, avant une éventuelle avancée.
- **§6 bis — Seringue** : 2 mana, sur un de ses bodybuilders. Son ATK double pour ce tour seulement (l'ATK du moment, bonus du tour compris ; une aura d'Arnold s'ajoute ensuite sans être doublée). Requiem 2 : piqué pendant son tour, il joue ce tour et son prochain tour, puis meurt au début du suivant, avant les revenus (sa mana zone ne compte plus) ; personne ne gagne de VP.
- **§7 — Sons et décor (handoff V5)** : la règle « la Bourrasque déclenche les pièges » du handoff était déjà en place ; on garde les réponses validées plus haut là où le handoff dit autre chose (un monstre `vol` déclenche les pièges ; un monstre qui survit à une bombe continue son chemin).
- **§6 bis — Familles Dragon élémentaire et Piège** : les dragons élémentaires sont le Jeune dragon élémentaire, les 4 dragons élémentaires et Origine ; les monstres piège, les 4 monstres du deck Pièges (Poseur de piège, Farceur, Poseur de bombe, Clown assassin). « Piège » est aussi le nom de la famille ; « monstre piège » ne désigne que ces monstres, pas les pièges posés.
- **§6 bis — Dragon élémentaire - Origine** : 10 mana, Vol, pas d'effet actif ni d'évolution (aucun Jeune dragon n'évolue en elle). Son aura donne +1 ATK, +1 PV et +1 mobilité aux dragons élémentaires alliés adjacents (Jeune dragon compris, pas elle-même), cumulable avec une autre Origine. ATK : comme l'aura d'Arnold. PV : en entrant dans l'aura, +1 PV et +1 PV max ; en la quittant (lui ou Origine s'éloigne, Origine disparaît), il perd ce PV et ce PV max, sans descendre sous 1 PV ; compté après chaque action. Mobilité : +1 au début de son tour s'il est adjacent à Origine à ce moment-là (pas en cours de tour).
- **§6 bis — Pénombre** (deck Pièges, ×2) : sort à 5 mana, sans cible à choisir : tous ses monstres piège sur le plateau deviennent invisibles comme le Farceur (Invisible 2 : vus dès qu'une unité adverse ou une case de la zone d'invocation adverse est à 2 cases ou moins, révélés s'ils bloquent une action adverse) jusqu'à la fin de son prochain tour (« pendant 1 tour »). Ceux qui arrivent ensuite n'en profitent pas. Jouable s'il a au moins un monstre piège.
- **§6 bis — Deck Sorciers du feu** : famille Sorcier du feu (Apprenti, Lutin brasier, Archimage, Golem de lave). « Si un monstre est touché par une attaque, il est burn pendant 2 tours » = le mot-clé Brûlure 1, 2 tours : burn 1 pendant 2 tours de la cible, terrains compris, comme la Brûlure de l'Archer du feu. « Burn x2 » (Archimage) = burn 2.
- **§6 bis — Lutin brasier** : effet actif, 1 mana : une case libre (sans unité, pas déjà brûlée) parmi ses « adjacents, rayon 2 » brûle jusqu'à la fin du 2e prochain tour de son camp (« pendant 2 tours » : deux tours adverses). Chaque monstre ennemi qui y entre (en passant, poussé, en avançant, invoqué ou téléporté, volant et invisible compris) perd 1 PV puis est burn 1 pendant 1 tour ; la case reste. Elle est visible des deux joueurs. Un monstre déjà sur la case quand elle s'éteint ou qui y reste n'est pas touché à nouveau ; seule l'entrée compte.
- **§6 bis — Archimage** : effet actif, 1 mana : tous les ennemis adjacents (zone « adjacents ») sont burn 2 pendant 2 tours.
- **§6 bis — Golem de lave** : passif « Passage » comme un terrain : chaque monstre ennemi qui entre sur une des 8 cases autour du Golem est burn 1 pendant 1 tour, une fois par mouvement. La zone suit le Golem ; quand c'est le Golem qui s'approche, rien ne se déclenche.

# Spécification MVP — TCG tactique (cartes + échecs)

Ce document est la référence pour implémenter le MVP. En cas de doute, demander plutôt que deviner.

## 1. Périmètre du MVP

**Dans le MVP**
- Jeu à 2 joueurs en local, sur le même écran (« hotseat »), dans le navigateur.
- Les deux joueurs utilisent le même grimoire de 25 cartes (section 6), ou chacun un deck pré-construit de 30 cartes (§6 bis).
- Toutes les règles de la section 4.
- Une IA d'entraînement simple, pour tester le jeu seul (§7 bis).

**Hors MVP** (ne pas implémenter, mais ne pas bloquer leur ajout futur)
- Réseau / multijoueur en ligne, comptes, deckbuilding, collection. (Des decks pré-construits, choisis avant la partie, sont proposés : voir §6 bis.)
- Sorts d'invocateur (liste pas encore définie).
- Effets de terrain du plateau (hauteur, fosse) : tout est en plaine en v1. Les falaises, elles, font partie du MVP (voir §3 et §10).

## 2. Architecture

- **TypeScript**, **Vite**, **React** pour l'UI, **Vitest** pour les tests. **PixiJS** (v8, WebGL) dessine le plateau 15 × 15 en vue isométrique (sol et décor peints, ambiance animée, cases, unités et leurs animations d'action), dans un canvas sous la scène en HTML qui ne garde que des cases transparentes ; la vue de dessus et le reste de l'interface restent en React et CSS.
- **Moteur de règles pur**, sans aucune dépendance à l'UI, dans `src/engine/` :
  - `createGame(): GameState`
  - `getLegalActions(state): Action[]`
  - `applyAction(state, action): GameState` — déterministe, ne mute pas `state`, lève une erreur si l'action est illégale.
  - `getPlayerView(state, player): PlayerView` — retire les informations cachées (grimoire adverse). L'UI n'affiche que des `PlayerView`. C'est ce qui permettra plus tard un serveur qui fait autorité.
- **Cartes décrites en données** (`src/engine/cards.data.ts`, le fichier qui fait foi pour les données des cartes ; `src/engine/cards.ts` : accès aux cartes et composition des decks) : stats + mots-clés + effets paramétrés. Pas de code spécifique par carte quand un mot-clé générique suffit.
- **Chaque partie garde ses cartes** (`GameState.cards`, publiques dans la vue) : celles de `cards.ts` par défaut, d'autres pour essayer des réglages (atelier de cartes). Le moteur, l'IA et l'écran de jeu ne lisent que les cartes de la partie ; les pages hors partie (Decks, Barèmes) lisent celles de `cards.ts`. L'atelier de cartes (`/atelier`) règle le coût, les stats, la valeur des mots-clés et le coût des effets actifs (un clic sur le prix d'un barème en fait le coût de la carte ; les tranches et les valeurs des barèmes se règlent sur la page Barèmes), sans toucher aux données des cartes : ses réglages restent dans le navigateur et passent par un fichier (export, import) ; des effets, seul le coût des effets actifs s'y règle (§9). « Tester en partie », ou « Cartes : De l'atelier » à l'accueil, lance une partie avec ces cartes, fixées à son lancement ; la partie le dit en jeu (repère « Atelier » de la barre du haut) et dès la première ligne du journal. En développement (`npm run dev`), « Enregistrer dans le projet » écrit ses réglages dans `cards.data.ts` et dans les lignes de ces cartes des tableaux de §6 et §6 bis : ce sont alors les cartes d'origine.
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

Les mana zones sont des cases jouables normales. Toutes les distances sont orthogonales (pas de diagonale), sauf l'attaque en diagonale (§4.7, §10).

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

### Grande carte « Champ de bataille » (13 × 13)

Carte proposée par défaut au lancement d'une partie (handoff V7), chargée depuis `src/engine/maps/champ-13x13.json`. Mêmes symboles et mêmes règles ; `~` : eau (règles d'une case X, seul le rendu change) ; `|` et `‾` marquent les falaises : hautes autour de la Mine (rien ne les franchit, ni les tirs, ni `vol`), basses autour de la Scierie (les tirs de portée 2+ et `vol` passent).

```
      c0 c1 c2 c3 c4 c5 c6 c7 c8 c9 10 11 12
r0     1  1  P  P  P  P  P  P  P| P  P  P  P
r1     1  P  P  P  P  P  P  P  P  P| P  S  P
r2     P  P  P  P  P  P  ~  P  P| P  P  P  P
                                        ‾‾
r3     P  P  P  X  X  P  ~  P  X  P  P  P  P
                                     ‾‾    ‾‾
r4     P  E  P  X  X  P  P  P  X  X  P  P  P
r5     P  P  P  P  P  P  P  P  P  X  P  P  P
r6     P  P  P  X  P  P  F  P  P  X  P  P  P
r7     P  P  P  X  P  P  P  P  P  P  P  P  P
r8     P  P  P  X  X  P  P  P  X  X  P  R  P
       ‾‾    ‾‾
r9     P  P  P  P  X  P  ~  P  X  X  P  P  P
          ‾‾
r10    P  P  P  P| P  P  ~  P  P  P  P  P  P
r11    P  M  P| P  P  P  P  P  P  P  P  P  2
r12    P  P  P  P| P  P  P  P  P  P  P  2  2
```

- **Symétrie** : identique pour les deux joueurs après une rotation de 180°, falaises comprises ; seule leur hauteur diffère (Mine fermée, Scierie ouverte aux tirs de portée 2+ et à `vol`).
- **Équilibre** (cases de marche depuis l'invocation la plus proche) : Forge à 11 pour chaque joueur, Mine et Scierie à 13 ; Écurie à 4 pour J1 et 18 pour J2, Ferme l'inverse.
- **Passages** : le mur de rochers de la colonne 3 est ouvert en (5, 3), à hauteur de l'ancienne place de l'Écurie ; celui de la colonne 9 en (7, 9), symétrique.
- **Pas de bonus de mobilité** : la mobilité d'un monstre est celle de sa carte (§10).

### Grande carte « Champ de bataille » (15 × 15)

Quatrième carte (handoff plateau 15), en plus des trois autres, chargée depuis `src/engine/maps/champ-15x15.json`. Mêmes symboles et mêmes règles, sans falaises ; trois sortes de cases X (§10) : `X` ordinaire, `H` haute (parois, crête et tas de minerai de la Mine), `B` basse (canal et billots de la Scierie, étangs). Les cases d'eau (canal, étangs) ne sont qu'un rendu : elles suivent la règle de leur hauteur.

```
      c0 c1 c2 c3 c4 c5 c6 c7 c8 c9 10 11 12 13 14
r0    1  1  P  P  P  P  P  P  P  H  P  P  P  P  P
r1    1  P  P  P  P  P  P  P  P  P  P  P  P  P  P
r2    P  P  E  P  P  P  P  B  P  H  P  H  M  P  P
r3    P  P  P  P  P  P  P  B  P  H  P  P  H  P  P
r4    P  P  P  P  X  X  P  P  P  H  P  P  P  P  P
r5    P  P  P  P  X  X  P  P  P  H  H  H  H  P  H
r6    P  P  P  P  P  P  P  P  P  P  X  P  P  P  P
r7    P  P  P  P  X  P  P  F  P  P  X  P  P  P  P
r8    P  P  P  P  X  P  P  P  P  P  P  P  P  P  P
r9    B  P  B  B  X  X  P  P  P  X  X  P  P  P  P
r10   P  P  P  P  P  X  P  P  P  X  X  P  P  P  P
r11   P  P  B  P  P  B  P  B  P  P  P  P  P  P  P
r12   P  P  S  B  P  B  P  B  P  P  P  P  R  P  P
r13   P  P  P  P  P  P  P  P  P  P  P  P  P  P  2
r14   P  P  P  P  P  B  P  P  P  P  P  P  P  2  2
```

- **Symétrie** : identique pour les deux joueurs après une rotation de 180° ; seule la hauteur des cases X diffère (Mine fermée, Scierie ouverte aux tirs de portée 2+ et à `vol`).
- **Invocations** : trois cases en L dans les coins, J1 en haut à gauche, J2 en bas à droite.
- **Mana zones** : Forge (7, 7), Écurie (2, 2), Ferme (12, 12), Mine (2, 12), Scierie (12, 2).
- **Équilibre** (cases de marche depuis l'invocation la plus proche) : Mine, Scierie et Forge à 13 pour chaque joueur ; Écurie à 3 pour J1 et 23 pour J2, Ferme l'inverse.
- **Mine** : zone de 5 × 5 (lignes 0 à 4, colonnes 10 à 14), fermée par des parois et par la crête rocheuse qui la borde (cases X hautes). Deux entrées : (1, 9) et (5, 13). Deux tas de minerai devant la mana zone, en (2, 11) et (3, 12) (cases X hautes).
- **Scierie** : zone de 5 × 5 (lignes 10 à 14, colonnes 0 à 4), bordée par un canal (cases X basses) et par la crête rocheuse (cases X ordinaires : la Scierie n'est ouverte aux tirs que par le canal). Deux ponts, cases libres, en (9, 1) et (13, 5). Deux billots en (11, 2) et (12, 3) (cases X basses).
- **Étangs** : (2, 7), (3, 7), (11, 7), (12, 7), cases X basses.
- **Pas de bonus de mobilité**, comme sur le 13 × 13 : les cartes ont déjà compté le +1 dans leur mobilité (§10).

## 4. Règles

### 4.1 Mise en place
- **Lancer de dés** : chaque joueur lance un dé à 6 faces ; en cas d'égalité, on relance les deux dés. Le joueur au plus gros chiffre choisit s'il commence ou non. Contre l'IA, si l'IA gagne le lancer, elle commence. J1 et J2 gardent leur place (J1 en haut, J2 en bas) : seul le tout premier tour change de main.
- Chaque joueur : 0 mana, 0 point de victoire (PV de victoire, noté **VP** dans le code pour éviter la confusion avec les points de vie), grimoire complet disponible.

### 4.2 Déroulé d'un tour
1. **Début de tour** du joueur actif, dans cet ordre (§10) :
   - Les statuts, pièges et cases brûlées arrivés à échéance disparaissent.
   - **Revenus** : en économie Classique, son mana non dépensé est d'abord perdu (en Réserve, il le garde, ci-dessous) ; puis le **mana de base de son tour** (3 à son premier tour, +1 à chacun de ses tours suivants, **jusqu'à la génération max** de la partie, 5 par défaut : 3, 3, 4, 4, 5, 5, 5… en comptant les deux joueurs) + 1 mana par mana zone qu'il contrôle **où il a un terrain** (+ bonus éventuels : Autel de mana, Porte-étendard ; un monstre seul sur une zone ne génère pas de mana) ; tout gain s'arrête à la **limite** de la partie (10 par défaut) ; 1 VP par mana zone qu'il contrôle (mode contestation : une zone contestée ne rapporte rien, §4.4 bis) ; aucun bonus pour le second joueur.
   - **Effets passifs** de début de tour (Ki né).
   - **Statuts** : requiem (le monstre meurt, sans VP), puis burn.
   - Ses monstres récupèrent toute leur mobilité, leur attaque et leurs effets actifs.
2. **Phase d'action**, dans l'ordre que le joueur veut, autant de fois que possible :
   - jouer une carte (invocation, sort, terrain) ;
   - déplacer un monstre ;
   - attaquer avec un monstre ;
   - utiliser l'effet activé d'un monstre.
3. **Fin de tour** : le joueur clique sur « Fin du tour ».

**Option « Minuteur »** (choisie à l'accueil, validée le 2026-11-10) : chaque joueur a **3 minutes de réflexion** par tour. Seul compte le temps où il réfléchit, sans rien qui se passe : les actions et leurs animations ne comptent pas. À 0:00, son tour finit, comme s'il avait cliqué « Fin du tour » (ce qu'il avait commencé, une sélection ou une bulle ouverte, est annulé) ; le journal le dit. Contre l'IA, seul le joueur humain est minuté ; en hotseat, l'écran de passage ne compte pas. Le temps restant s'affiche à côté de « Fin du tour », en alerte sous 30 secondes. Le minuteur vaudra aussi pour les parties en ligne (§9).

**Réglages du mana** (choisis à l'accueil, dans les deux économies, validés le 2026-11-08) :
- **Génération max** (5 par défaut, de 3 à 10) : le plafond du mana de base ; le mana des mana zones s'ajoute par-dessus.
- **Limite** (10 par défaut, de 5 à 20) : le mana qu'un joueur peut avoir **au total, à tout moment**. Tout gain s'y arrête (mana de base, mana des zones, gains pendant le tour) et le surplus est perdu ; une dépense n'est pas touchée. Les terrains ne changent pas la limite.

**Économie Classique** (règle par défaut) : le mana ne se cumule pas d'un tour à l'autre : ce qu'on n'a pas dépensé est perdu au début de son tour suivant (§10).

**Option « Économie : Réserve »** (choisie à l'accueil, validée le 2026-11-08) :
- **Le mana se garde** d'un tour à l'autre : les revenus du début de tour (mana de base et mana des zones) s'ajoutent à la réserve, jusqu'à la limite.
- Mana de base et limite : les réglages du mana ci-dessus, comme en Classique.
- En gardant son mana, on peut poser une carte à 7 dès son 2e tour (3 + 4) : voulu.

### 4.3 Grimoire
- Toutes les cartes du grimoire sont jouables à tout moment pendant son tour, si on a le mana.
- Pas de limite par tour pour jouer des cartes : seul le mana compte. Un second exemplaire d'un même sort se lance dans le même tour s'il reste du mana. Seuls les effets de monstres ont une limite : une fois par tour/carte (sauf un effet actif « sans limite par tour », §5.2) ; et le bonus d'un terrain « Au déplacement » : une fois par tour pour chaque monstre (§5.2).
- Une carte jouée quitte le grimoire. Le **cimetière** (public) reçoit les sorts lancés, et les monstres et terrains qui quittent le plateau (détruits, sacrifiés, tués par requiem) ; un monstre ou un terrain posé n'y va pas.
- **Sur le plateau** (public) : les cartes des unités d'un joueur sur le plateau, monstres et terrains, **invisibles et camouflées comprises** : ce qui a été joué est public, seule leur case est cachée (§10).
- **Informations publiques** : cimetière et unités sur le plateau de chaque joueur, nombre de cartes restantes, mana, VP.
- **Information cachée** : le contenu du grimoire adverse.
- Hotseat : entre deux tours, afficher un écran « Passe l'écran au joueur X » qui masque tout jusqu'au clic.

### 4.4 Contrôle des mana zones
- Une zone est contrôlée par le joueur dont un monstre l'occupe.
- Sans monstre, elle est contrôlée par le joueur dont un terrain l'occupe.
- Sinon, elle est neutre.
- Le contrôle est évalué au début de chaque tour (section 4.2).

### 4.4 bis Mode contestation

Un second mode de jeu, choisi à l'accueil à côté de la carte : « Normal » (les règles ci-dessus) ou « Contestation ». Il n'est proposé que sur les deux grandes cartes, 13 × 13 et 15 × 15 (§10). Il ne change que les mana zones :

- **Zone de 9 cases** : la mana zone et les 8 cases autour (le carré 3 × 3 dont elle est le centre). Une case X en fait partie, mais personne ne s'y tient.
- **Être dans la zone** : avoir un monstre ou un terrain sur une de ses cases. Un monstre camouflé compte aussi ; l'état de la zone reste public (§10).
- **Contrôle** :
  - un **terrain** dans les 9 cases **tient la zone** pour son propriétaire, **quel que soit le nombre de monstres ennemis** (le terrain ne compte pas dans le nombre : il se détruit pour la reprendre) ;
  - sans terrain, **supériorité numérique sur les monstres** : on compte les monstres de chaque joueur dans les 9 cases (camouflés compris, 1 chacun) ; le joueur qui en a **le plus** tient la zone (2 contre 1 : il la garde) ; **égalité** avec des monstres des deux camps (1 contre 1, 2 contre 2) : la zone est **contestée** ; aucun monstre : elle est neutre.
- **Capturer** une zone : y avoir plus de monstres que l'adversaire, ou détruire son terrain.
- **Revenus** (début de tour, §4.2) : une zone tenue rapporte comme une mana zone du mode Normal, +1 VP, et +1 mana (bonus compris) si son propriétaire y a un terrain. Une zone contestée ne rapporte rien à personne, ni mana ni VP. Bonus : l'Autel de mana de la zone, et chaque monstre `etendard` du joueur qui la tient, sur n'importe quelle case de la zone.
- **Terrains** : seulement sur la mana zone (la case centrale), sous un de ses monstres, comme au §4.9, et seulement dans une zone qu'on **tient** : ni contestée, ni tenue par le nombre de monstres de l'adversaire, ni tenue par un terrain adverse.

### 4.5 Invocation
- Payer le coût de la carte, poser le monstre sur une case d'invocation **libre** de son camp.
- La case d'un de ses terrains « Point d'invocation » (Zone d'invocation) est aussi une case d'invocation de son camp, tant qu'aucun monstre ne s'y trouve.
- L'effet « Invocation » (Invocateur) pose le monstre sur une case libre du carré de 1 de la source, en payant aussi son coût (§5.4).
- Le monstre peut agir immédiatement (mobilité complète, attaque, effet).
- Occuper les cases d'invocation adverses est autorisé (stratégie de blocage).

### 4.6 Déplacement
- Déplacement orthogonal, 1 point de mobilité par case.
- On peut traverser ses alliés, sauf un allié stun ou immobilisé ; jamais les ennemis (monstres ou terrains), ni les cases `X` ou `.`.
- On ne peut pas terminer sur une case occupée.
- La mobilité peut être fractionnée : bouger, attaquer, puis rebouger avec ce qui reste.

### 4.7 Attaque
- Une attaque par monstre et par tour, sauf bonus : l'aura « Carquois prêt ! » de l'Écuyer des archers donne 2 attaques par tour (§5.2, §10).
- Cible : une unité ennemie (monstre ou terrain) en ligne droite orthogonale, à une distance ≤ portée. **Attaque en diagonale** (§10) : une case de diagonale compte pour 2 de portée (distance orthogonale) : un monstre frappe aussi une unité ennemie sur une des 4 diagonales, jusqu'à portée ÷ 2 cases (portée 2-3 : 1 case, 4-5 : 2, 6 : 3), les cases entre les deux libres.
- Ligne de vue : les cases entre l'attaquant et la cible doivent exister, ne pas être `X`, et être vides **ou n'avoir que des unités alliées de l'attaquant, monstres et terrains : un allié ne gêne pas le tir** (§10). Une unité ennemie, monstre ou terrain, arrête le tir.
- Si une case contient un monstre et un terrain, l'attaque touche le monstre ; le terrain n'est attaquable que seul.
- Dégâts = ATK de l'attaquant, retirés aux points de vie de la cible. Les dégâts restent.
- **Pas de riposte**, sauf mot-clé `riposte`.
- Points de vie ≤ 0 → l'unité est détruite. Détruire un **monstre** rapporte 1 VP au joueur qui l'a détruit (attaque, sort, effet ou riposte). Détruire un terrain ne rapporte rien.
- **Avancée** : si l'attaquant était au contact et a détruit la cible, il peut immédiatement prendre sa place gratuitement (sans dépenser de mobilité). C'est optionnel.

### 4.8 Effets activés
- Utilisables une fois par tour/carte, en payant leur coût en mana. Un monstre peut en avoir plusieurs : chacun s'utilise une fois par tour/carte (§10). Exception : un effet « sans limite par tour » (Emma - Vampire) s'utilise tant qu'on paie son coût.
- N'utilisent pas l'attaque du monstre (après un effet « puis plus d'attaque ce tour », Zoldik - Vampire, il ne peut plus attaquer ce tour).

### 4.9 Terrains
- Se posent sur une mana zone occupée par un de ses propres monstres. Une case peut contenir un monstre et un terrain du même joueur.
- Le monstre peut ensuite partir ; le terrain reste et tient la zone.
- Mode contestation (§4.4 bis) : pas dans une zone contestée.
- Un terrain n'a ni ATK ni mobilité. Les ennemis ne peuvent pas entrer sur sa case tant qu'il n'est pas détruit.

### 4.10 Victoire
- Le premier joueur à atteindre **30 VP** gagne immédiatement. Le nombre de VP pour gagner se choisit à l'accueil avant la partie : de 10 à 50, de 5 en 5, 30 par défaut (validé le 2026-11-10).
- Les valeurs (30 VP, 3 mana) sont des constantes dans `src/engine/config.ts`, pour pouvoir les ajuster facilement.

## 5. Lexique

Le vocabulaire des cartes : un mot = une notion, la même dans les textes de cartes, dans ce document et dans le code. Une carte s'écrit avec ces mots. Un mot absent du lexique, ou une phrase qui peut se lire de deux façons, appelle une question ; la réponse vient compléter le lexique. Le texte affiché sur les cartes en jeu est généré à partir des données du moteur : s'il diffère du texte voulu, c'est un malentendu à corriger.

**Style des textes (validé)** : phrases naturelles et courtes, façon Hearthstone ; les mots du lexique en gras, leur définition au survol. Le lexique est la référence interne ; un texte de carte n'emploie jamais un mot dans un autre sens que le sien (« téléporté » et « repoussé » ne s'échangent pas). Le détail va au survol, les cas rares aux précisions (§10).

### 5.1 Termes de base

| Terme | Code | Sens |
|---|---|---|
| Unité | `unit` | Un monstre ou un terrain posé sur le plateau. |
| Allié / ennemi | `side: ally` / `enemy` | Toujours un **monstre** (jamais un terrain), sauf mention contraire. |
| Coût | `cost` | Mana à payer pour jouer la carte. |
| ATK · PV · PV max | `atk` · `hp` · `maxHp` | PV = points de vie. Les points de victoire s'écrivent **VP** (`vp`). |
| Mobilité | `mobility` | Nombre de cases parcourues par tour, en orthogonal (§4.6). |
| Portée | `range` | Distance maximale d'une attaque ou d'un effet, **en ligne droite**, avec ligne de vue (§4.7). Seule exception : l'attaque en diagonale d'un monstre de portée 2+ (§10). |
| Au contact | `contact` | À 1 case, en ligne droite (pas en diagonale : une attaque en diagonale n'est pas un contact). Attaques de portée 1, riposte, avancée, Trophée, Pillage. |
| Carré de N | `square` | Les cases autour du sujet à N cases au plus, **diagonales comprises**, sans la case du sujet : carré de 1 = les 8 cases autour, carré de 2 = les cases autour plus celles d'après (24 cases, le carré 5 × 5 sans le centre). Falaises et cases `X` coupent la zone (§10). À ne pas confondre avec la portée. Remplace « adjacent » (8 cases) et « rayon N » (§10, 2026-11-08). |
| Adjacent | `adjacent` | Une des **4 cases orthogonales** autour (haut, bas, gauche, droite), sans les diagonales ; jouable et sans falaise entre les deux. Aucune carte ne l'emploie encore (§10, 2026-11-08). |
| À N pas | `steps` | À N cases au plus en comptant un chemin orthogonal, en L possible, sans ligne de vue (Boule de feu). |
| Nom d'une carte de deck | `name` | « Nom - Archétype », l'archétype étant le nom de son deck (« Arnold - Bodybuilder », « Apprenti - Sorciers du feu »). Les cartes de base (§6) et communes (§6 ter) gardent leur nom seul. L'interface écrit le nom en gros, l'archétype dessous (§10). |
| Archétype | `archetype` | Groupe de cartes d'un deck qui vont ensemble, le même mot que dans « Nom - Archétype » (Archers impériaux, Bodybuilder, Dragons élémentaires, Maîtres des pièges, Sorciers du feu, Explorateur du temps, Vampire). « Un allié bodybuilder » : un de ses monstres de l'archétype Bodybuilder ; « un allié archer impérial » : de l'archétype Archers impériaux ; « un allié vampire » : de l'archétype Vampire. Une carte générique (de base, commune, ou le Trébuchet) n'a pas d'archétype, même dans un deck (§10). |
| Tour | `turn` | Le tour d'un joueur : le tour de J1 puis celui de J2 font 2 tours. Une durée de statut se compte en tours du camp de l'unité touchée (§5.5). |
| Rayon N | `radius` | Les cases autour d'une carte : rayon 1 = les 8 cases adjacentes, rayon 2 = 24 cases (le carré 5 × 5 sans la case centrale) ; falaises et cases `X` coupent la zone comme pour « adjacent ». À ne pas confondre avec la portée. |
| Une fois par tour/carte | — | Chaque exemplaire une fois par tour. C'est la règle de tous les effets de monstres (effet actif, riposte), sauf un effet actif « sans limite par tour » (§5.2). Jouer une carte (sort, monstre, terrain) n'a pas de limite : seul le mana compte (§4.3). Les effets des terrains n'en ont pas non plus (Passage : à chaque case), sauf Au déplacement : une fois par tour pour chaque monstre, tous exemplaires confondus (§5.2). |
| Cimetière | `graveyard` | Zone publique hors du plateau : sorts lancés, monstres et terrains qui ont quitté le plateau (§4.3). |
| Case d'invocation | `summonCell` | Une case de son camp où il invoque (§3), et la case d'un de ses terrains Point d'invocation (Zone d'invocation) tant qu'aucun monstre ne s'y trouve (§4.5). « Zone d'invocation » reste le nom du terrain (§10, 2026-11-10). |
| Sur le plateau | — | Liste publique des cartes des unités d'un joueur sur le plateau, invisibles et camouflées comprises (sans leur case) ; calculée à partir du plateau, pas gardée dans l'état (§4.3, §10). |
| Chemin du tour | `trail` | Les cases où un monstre a été depuis le début du tour de son camp (ou son arrivée), dans l'ordre, sa case de départ comprise ; tout mouvement l'allonge (déplacement, recul, avancée, téléportation). Retour et sablier s'en servent (§10). |
| Devant · par derrière | `facing` | Un monstre regarde dans le sens de son dernier pas (§10). « Devant » : la case dans ce sens. « Par derrière » : l'attaquant frappe dans le sens où regarde sa cible. |

### 5.2 Écrire un effet

Un effet s'écrit **Déclencheur · Cible ou zone · Effet(s)**, avec une durée pour un statut. Il peut porter un nom (« Déflagration »), sans effet de règle. Une carte qui a plusieurs effets les sépare par « ; » (« Vol ; Actif (3 mana) · … »).

Exemple : « Actif (3 mana) · Déflagration · 3 cases devant · 2 dégâts + burn 1 pendant 1 tour ».

| Déclencheur | Code | Sens |
|---|---|---|
| Actif (N mana) | `activated` | Le joueur l'active, une fois par tour/carte, en payant N mana. N'utilise pas l'attaque du monstre. Un monstre qui en a deux peut utiliser chacun, une fois par tour. « Actif (N mana, sans limite par tour) » (`unlimited`) : autant de fois qu'il paie N mana (Emma). « Actif (N mana, puis plus d'attaque ce tour) » (`endsAttack`) : utilisable même s'il a déjà attaqué, mais il ne peut plus attaquer ce tour après l'avoir activé (Zoldik). |
| Passif | `passive` | Toujours en vigueur, sans coût. Les mots-clés (§5.6) sont des passifs. |
| Sort | `spell` | L'effet se résout quand la carte est jouée. |
| À l'attaque | `onHit` | Après les dégâts d'une attaque de ce monstre, sur sa cible. |
| Quand il détruit | `onKill` | Quand une attaque de ce monstre détruit un monstre. « Quand il détruit une unité » : un monstre ou un terrain ; l'effet s'applique au monstre lui-même. |
| Début de tour | `turnStart` | Au début de chaque tour de son camp, après les revenus et avant les statuts (§4.2). |
| Aura | `aura` | Passif : tant qu'ils sont dans la zone de la source, les monstres visés ont le bonus (il se cumule avec celui d'une autre aura). Bonus d'ATK, de PV, de mobilité ou de portée, nombre d'attaques par tour (§10), ou camouflage N (Terrain de jeu : tenu tant que le monstre est dans la zone, sans durée). |
| Piège | `trap` | Quand un monstre ennemi entre sur la case piégée (§10). |
| Passage | `passage` | Terrain : quand un monstre ennemi entre sur une case de sa zone : à chaque case en marchant, une fois par recul (§10). |
| Zone | `passage` (`lingering`) | Monstre (Golem de lave) : comme Passage, mais elle agit sur tout ennemi dans la zone : quand il y entre, quand la source arrive à côté de lui (une fois par déplacement), et au début de chaque tour de son camp sur ceux qui y sont encore (§10). |
| Au déplacement | `onMove` | Terrain : quand un de ses monstres commence un déplacement (§4.6) sur une case de sa zone, même s'il reste dans la zone ; un recul, une avancée ou une téléportation ne le déclenchent pas. Une fois par tour pour chaque monstre, tous exemplaires de la carte confondus (§10). |

#### Fiche d'un effet de monstre (validé le 2026-11-08)

Tout effet de monstre se donne avec ces champs, dans cet ordre :

| Champ | Obligatoire | Sens |
|---|---|---|
| Nom | oui | Le nom de l'effet (« Miroir de souvenirs »). |
| Type | oui | « actif » ou « passif ». |
| Condition d'activation | non | Ce qu'il faut pour pouvoir l'activer, ou pour que l'effet agisse (« Un ennemi visible dans un carré de 1 »). |
| Coût d'activation | non | Le coût, en mana (« 1 mana »). Rien pour un passif. |
| Effet | oui | Ce qui se passe (« La cible est stun pendant 1 tour »). |
| Contre-coup | non | Ce que le lanceur subit en retour de l'effet, sur lui-même, une fois l'effet joué, même si la cible n'a rien subi (« Inflige silence au lanceur jusqu'à la fin de son prochain tour »). Dit « contre-coup : … » dans la notation. |
| Limites | non | Combien de fois il s'utilise (« 1x/tour »). |

Un champ absent est nul, jamais deviné. **Quand l'utilisateur donne un nouvel effet de monstre, on lui demande les champs obligatoires qui manquent (nom, type, effet) et on lui confirme que les autres sont nuls**, avant d'implémenter.

### 5.3 Cibles et zones

**Cible** : le joueur choisit un monstre.

| Terme | Code | Sens |
|---|---|---|
| un allié / un ennemi | `anywhere` | N'importe où sur le plateau. |
| … dans un carré de 1 | `square1` | Sur une des 8 cases autour de la source. |
| … en ligne, portée N | `line`, `range` | Comme une attaque de portée N (ligne droite, ligne de vue). |
| … à N pas d'un de vos monstres | `nearOwnMonster`, `steps` | Voir « À N pas ». Plus aucune carte ne l'emploie (Boule de feu : carré de 3, 2026-11-10). |
| … dans un carré de N d'une de vos unités | `nearOwnUnit`, `square` | Dans le carré de N d'un de ses monstres ou terrains ; falaises et cases `X` coupent le carré (Boule de feu, §10). |
| un allié bodybuilder · un allié archer impérial | `archetype` | Un de ses monstres de cet archétype, n'importe où. |
| lui-même | `self` | Le monstre source (Dopage de Jean Bon). |
| une case libre, carré de 1 | `emptySquareCell` | Case jouable du carré de 1, sans unité (pose de piège, invocation, téléportation). |
| une case libre, carré de 2 | `emptyCell`, `square2` | Case jouable sans unité ni case brûlée, dans le carré de 2 de la source (Lutin brasier). |
| une case de son chemin du tour | `trail` | Case libre (sans monstre ni terrain adverse) du chemin du tour de la source, sauf sa case actuelle (retour). |
| un de ses terrains | `terrain` | Un de ses terrains, n'importe où (Fortification). « Allié » reste un monstre (§5.1). |
| un monstre de son cimetière | `graveyard` | Une carte de monstre de son cimetière, au choix, et une de ses cases d'invocation libres (Réanimation). |
| sans cible | `none` | L'effet est pour le joueur (Élixir de mana). |

**Zone** : l'effet touche tous les monstres ennemis de la zone, **invisibles compris** (validé le 2026-11-08 : être caché empêche l'adversaire de voir le monstre, ça ne le protège de rien), jamais un terrain ni un allié. Il n'est jouable que si le lanceur y voit au moins un ennemi (sauf mention contraire, comme Hurlements).

| Terme | Code | Sens |
|---|---|---|
| 3 cases devant | `front3` | La case devant la source et ses deux voisines de côté (en diagonale de la source), si elles sont dans le carré de 1. |
| Carré de 1 | `square1` | Les 8 cases autour de la source. |
| 3 cases en ligne, direction au choix | `line3` | Le joueur choisit une direction (haut, bas, gauche, droite) : les 3 cases en ligne droite à partir de la source, jusqu'à la première falaise ou case `X` (exclue). La source se tourne vers cette direction avant l'effet (un recul « vers l'avant » part donc dans ce sens). |
| Carré de 2 | `square2` | Les cases du carré de 1 de la source, et les cases du carré de 1 de celles-ci (sans la source) : le carré 5 × 5 sur terrain dégagé ; falaises et cases `X` coupent la zone comme pour le carré de 1. |
| sa case et carré de 1 | `cellAndSquare` | La case de la source et les 8 cases autour ; falaises et cases `X` coupent la zone comme pour le carré de 1. Pour un déclencheur de terrain sur ses monstres (Au déplacement), pas un effet sur les ennemis. |
| bodybuilders alliés, carré de 1 | `square1`, `archetype` | Pour une aura ou un effet de début de tour : ses monstres de cet archétype sur les 8 cases autour de la source (pas la source elle-même). |
| maîtres des pièges alliés, sa case et carré de 1 | `cellAndSquare`, `archetype` | Aura d'un terrain (Terrain de jeu), sur le modèle de « bodybuilders alliés, sa case et carré de 1 » (Salle de sport) et « archers impériaux alliés, … » (Camps de tir). |
| bodybuilders alliés, carré de 2 | `square2`, `archetype` | Comme ci-dessus, sur le carré de 2 de la source (carré 5 × 5 sur terrain dégagé ; falaises et cases `X` coupent la zone), pas la source elle-même (Rudy, Arnold, Ki né). |
| tous les maîtres des pièges alliés | `allies`, `archetype` | Tous ses monstres de cet archétype, où qu'ils soient, sans choix (Pénombre) ; jouable s'il en a au moins un. |
| tous les ennemis | `enemies` | Tous les monstres ennemis, où qu'ils soient, sans choix (Piège temporel), invisibles compris ; jouable si le lanceur en voit au moins un. |
| 3 cases en ligne et 2 diagonales devant, direction au choix | `line3Diagonals` | Comme « 3 cases en ligne, direction au choix », plus les 2 cases en diagonale devant la source (de part et d'autre de la première case de la ligne), si elles sont dans son carré de 1 : 5 cases sur terrain dégagé. La source se tourne vers la direction choisie (dragons élémentaires). |
| un dragon élémentaire allié · ennemis, carré de N de la cible | `enemiesAroundAlly`, `archetype`, `square` | Le joueur choisit un de ses monstres de l'archétype ; l'effet touche les monstres ennemis de son carré de N (falaises et cases `X` coupent la zone), invisibles compris. Jouable dès qu'il a un monstre de l'archétype, même sans ennemi autour (Hurlements, carré de 5). |

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
| +N VP · +N mana | `gainVp` · `gainMana` | `amount` | Pour le joueur de la source, ou du sort. Un gain de mana s'arrête à la limite (§4.2) ; un sort qui ne ferait que ce gain n'est pas jouable à la limite (Élixir de mana). |
| Retire ses malus | `cleanse` | — | Retire tous ses statuts malus (§5 bis), requiem compris ; ses bonus restent. Il retrouve la mobilité que ses malus lui avaient prise ce tour (slow, stun, immobilisé : au début de son tour ou pendant), sauf si son déplacement est fini sans statut (sablier, arrêt forcé). Impossible sur un monstre sans malus (Cure, §10). |
| Réanimation | `reanimate` | — | Le monstre choisi dans son cimetière est invoqué sur la case visée (une de ses cases d'invocation libres), **sans payer son coût**, avec tous ses PV et sans statut ; il peut agir aussitôt (§4.5) et entre sur sa case. Il quitte le cimetière ; ce n'est pas une carte jouée (§10). |
| Piège | `placeTrap` | `effects` | Piège une case libre, carré de 1 ; ses effets s'appliquent au monstre ennemi qui y entre (§10). Il reste « N tours adverses » (§5.5, 1 par défaut) ; « un seul à la fois » : un nouveau piège du même monstre fait disparaître l'ancien (Sablier du temps). Selon ses effets, l'interface l'appelle bombe (dégâts), filet (immobilisé) ou sablier (remonte N cases). |
| Case brûlée pendant N tours : effets | `burnCell` | `turns`, `effects` | La case visée brûle, visible des deux joueurs, pendant N tours du camp du lanceur (§5.5) ; chaque monstre ennemi qui y entre subit les effets, et la case reste (§10). |
| Évolution | `evolve` | — | Sacrifie la source pour invoquer à sa place un monstre de son grimoire qui en évolue, sans payer son coût ; le nouveau monstre n'agit pas ce tour. Pas le tour où la source est arrivée (§10). |
| Invocation | `summon` | — | Invoque sur la case visée un monstre de son grimoire, choisi par le joueur, en payant aussi son coût ; il peut agir aussitôt (§4.5). |
| Téléportation | `teleport` | `to` | Pose le monstre ciblé sur une case choisie par le joueur : sans précision, une case libre du carré de 1 de la source (Téléporteur) ; « à N cases au plus de la cible, sans obstacle » (`around`, Flash) : une case libre à N cases au plus du monstre, diagonales comprises, sans regarder ce qu'il y a entre les deux (ni case `X`, ni falaise) ; « sur une case d'invocation libre de son camp » (`summonCell`, Repli) ; « sur un de ses terrains sans monstre » (`ownTerrain`, Téléportation). Ce n'est pas un déplacement : il garde sa mobilité, son attaque et son orientation, même immobilisé ou stun. Il entre sur la case d'arrivée : piège, Passage, case brûlée et Zone s'y déclenchent (§10). |
| Retour | `returnOnTrail` | — | La source se téléporte sur une case libre où elle a été ce tour (son chemin du tour, sa case de départ comprise), choisie par le joueur ; ce qui est sur cette case se déclenche (§10). Elle garde son orientation, son attaque (une seule par tour) et sa mobilité restante : elle peut encore se déplacer (2026-11-10, §10 ; avant, plus de déplacement après le retour). |
| Remonte N cases | `rewind` | `steps` | Effet d'un piège (sablier) : le monstre revient de N cases en arrière sur son chemin du tour (à son départ s'il est plus court), en téléportation (ce qui est sur la case d'arrivée se déclenche) ; son déplacement s'arrête, sans plus de mobilité ce tour (§10). |
| Absorbe N PV · absorbe tous ses PV sauf N | `absorb` | `amount` · `downTo` | Retire N PV à la cible (ou tous ses PV sauf N, sans la détruire) ; la source récupère les PV retirés, sans dépasser ses PV max. Une destruction rapporte le VP au joueur de la source. Ce n'est pas une attaque (pas de riposte). « Tous ses PV sauf N » : impossible sur une cible qui a N PV ou moins. Sur une zone, chaque ennemi touché perd N PV (Vladimir, §10). |
| Perd tous ses PV sauf N | `loseHp` | `downTo` | La cible tombe à N PV, sans être détruite ; ses PV max ne changent pas. Impossible sur une cible qui a N PV ou moins. |
| +N ATK par PV perdu (pour ce tour) | `addAtkThisTurn` | `amount`, `perHpLost` | Après « perd tous ses PV sauf N » : +N ATK pour chaque PV perdu, jusqu'à la fin du tour en cours. |
| Se transforme en X | `transform` | `into` | La source prend sa forme X (stats, mots-clés, effets) : c'est le même monstre, sur sa case (§10, Emma). Une forme qui n'est pas une carte du grimoire (`formOf`) renvoie à sa carte d'origine (cimetière). Le mot « transforme » n'a pas d'autre sens. |

Plusieurs effets s'enchaînent avec « + », dans l'ordre écrit : « 2 dégâts + burn 1 ».

### 5.5 Durées

Un statut dure un nombre de tours propre à l'effet qui le pose. On compte les tours **du camp de l'unité touchée** ; le tour en cours ne compte pas.

| Terme | Code | Sens |
|---|---|---|
| pendant N tours | `turns: N` | Jusqu'à la fin du N-ième prochain tour de son camp. Burn N pendant 2 tours : 2 pertes de N PV, au début de ses 2 prochains tours. |
| jusqu'à son prochain tour | `turns: 0` | Jusqu'au début du prochain tour de son camp : pris pendant son propre tour, il dure le reste de ce tour, puis il est libre (filet du Poseur de piège, slow du Terrain piégé). |

| N tours adverses | `turns: N` (piège) | Durée d'un **piège** posé (§10) : il reste jusqu'à la fin du N-ième tour de l'adversaire de son poseur, soit jusqu'au début du N-ième prochain tour de son poseur, ou plus tôt s'il est déclenché. Par défaut 1. Filet, Bombe et Sablier du temps : 3. |

Hors statuts : « +N mobilité », « +N ATK » et « +N portée » (pour ce tour) valent pour ce tour, « +A ATK +P PV » vaut définitivement.

### 5.6 Mots-clés

Un mot-clé est un raccourci : un nom, parfois un nombre, et une définition écrite avec les mots ci-dessus. Le nombre est propre à chaque carte.

| Mot-clé | Code | Définition |
|---|---|---|
| Riposte | `riposte` | Quand ce monstre est attaqué au contact et survit, il inflige son ATK à l'attaquant. Une fois par tour/carte (§10). |
| Vol | `vol` | En se déplaçant, survole les cases `X` et les falaises de la Scierie (pas celles de la Mine, zone fermée), mais pas les ennemis ; ne termine jamais sur une case `X` ou `.` (§10). |
| Prime N | `prime` | Quand il détruit : +N VP, en plus du VP habituel. |
| Trophée N | `trophee` | Quand il détruit un monstre au contact : +N VP, en plus du VP habituel. |
| Pillage N | `pillage` | Quand il détruit un monstre au contact : +N mana. |
| Étendard N | `etendard` | La mana zone qu'il occupe rapporte +N mana, si son camp y a un terrain (mode contestation : la zone où il se trouve, si son camp la tient, §4.4 bis). |
| Givre N | `givre` | À l'attaque : slow N pendant 1 tour (pas sur un terrain). Une autre durée s'écrit après : « Givre 1, 2 tours ». |
| Brûlure N | `brulure` | À l'attaque : burn N pendant 1 tour. Une autre durée s'écrit après : « Brûlure 1, 2 tours ». |
| Siège ×N | `siege` | Dégâts ×N contre un terrain. |
| Sournois +N | `sournois` | En attaquant un monstre par derrière : +N ATK pour cette attaque. |
| Attaque par surprise ×N | `assassin` | En attaquant un monstre par derrière : dégâts ×N. Anciennement « Assassin ×N » (renommé le 2026-11-08 : « Assassin » est aussi un rôle de fiche, sans règle). |
| Camouflage | `camouflage` | Invisible à plus de 2 cases : invisible pour l'adversaire tant qu'aucun monstre ni terrain adverse n'est dans un carré de 2 autour de lui (§10, §5 bis). Sans valeur (ancien « Camouflage N » : seul N = 2 servait). |
| Soif N | `soif` | À l'attaque d'un monstre : il récupère N PV (soin N sur lui-même, sans dépasser ses PV max), après les dégâts et avant une riposte ou une avancée ; aussi quand la cible est détruite, **jamais contre un terrain** (2026-11-10, §10). |
| Point d'invocation | `summonPoint` | Terrain : sa case est une case d'invocation de son camp, tant qu'aucun monstre ne s'y trouve (§4.5). |

### 5.7 Conventions du code

- Un paramètre a toujours le même nom : une quantité `amount`, une portée `range`, une distance en pas `steps`, un recul `distance`, un multiplicateur `multiplier`, une durée de statut `turns`, des PV restants `downTo` (« tous ses PV sauf N »).
- Les nombres d'une carte sont dans ses données, pas dans des constantes globales ; `config.ts` ne garde que les règles générales (30 VP, 3 mana par tour…).
- Les noms propres du jeu (mots-clés, statuts, cartes, mana zones) gardent le mot français, sans accent (`immobilise`, `brulure`) ; les notions techniques sont en anglais (`damage`, `heal`, `push`).
- Un effet sans nombre (stun, immobilisé, Vol, Riposte) n'a pas de paramètre `amount`.

## 5 bis. Statuts

Norme des statuts (validée le 2026-11-08). Un statut est posé sur une unité par un effet. **Chaque effet donne sa durée** (`turns`, §5.5), comptée en tours **du camp de la cible** ; « jusqu'à son prochain tour » vaut 0. Un statut est un **bonus** ou un **malus**.

**Malus**

| Statut | Code | Effet |
|---|---|---|
| Burn N | `burn` | Perd N PV (un par brûlure) au début de son tour. |
| Slow N | `slow` | Retire N de mobilité (un par slow). C'est le **seul malus de mobilité** : « mobilité −X » n'existe pas, il s'écrit Slow X (§10). |
| Immobilisé | `immobilise` | Ne peut pas se déplacer (ni avancer après une attaque) ; peut attaquer et activer ses effets. |
| Absorbé | `absorbe` | Perd 1 PV (N PV) par effet d'absorption au début du **tour adverse** (celui de l'adversaire de son porteur) ; le monstre qui l'a posé (`by`) **gagne les PV réellement perdus** (liés), sans dépasser ses PV max. Une destruction profite à l'absorbeur, comme burn. |
| Stun | `stun` | Aucune action possible : ni déplacement, ni attaque, ni effet actif, ni riposte. |
| `<stat>` −X | `stat` (`amount` < 0) | Perd X dans une stat : ATK, portée ou PV max, pendant la durée (en mobilité, c'est un slow). |
| Silence | `silence` | Ne peut pas activer ses effets actifs (Retour compris) ; attaque, déplacement, mots-clés et passifs inchangés. |
| Désarmé | `desarme` | Ne peut pas attaquer ; déplacement et effets actifs possibles. (Ex-« Épuisé », §10.) |
| Requiem | `requiem` | **Sans paramètre** : meurt au début de son **deuxième** tour après affectation (le monstre joue encore ce tour-là et son prochain tour), avec les statuts (§4.2), sans VP pour personne. |

**Bonus**

| Statut | Code | Effet |
|---|---|---|
| Camouflage | `camouflage` | **Invisible à plus de 2 cases** : invisible pour l'adversaire tant qu'aucun de ses monstres ni terrains n'est dans un carré de 2 (Farceur, Pénombre). |
| Invisible | `invisible` | **Invisible à plus de 1 case** : un carré de 1 le révèle (Terrain de jeu, par son aura). |
| Absorbation | `absorbation` | Gagne 1 PV (N PV) au début de son tour, jusqu'à ses PV max (un par instance). |
| `<stat>` +X | `stat` (`amount` > 0) | Gagne X dans une stat : ATK, mobilité, portée ou PV max, pendant la durée. |
| Récupération X | `recuperation` | Gagne X PV au début de son tour, jusqu'à ses PV max. |
| Vol | `vol` | **Peut survoler les cases X**, comme le mot-clé Vol (§5.6) : survole les cases `X` et les falaises de la Scierie (pas celles de la Mine), mais pas les ennemis, et ne termine jamais sur une case `X` (§10). Un mot, une notion : le mot-clé est la version permanente d'une carte, le statut la version posée pour une durée. |
| Carapace | `carapace` | **Ses PV ne descendent pas sous 1**, quels que soient les dégâts (attaque, riposte, sort, effet, piège, Passage, Zone, burn, absorbé), pendant toute sa durée ; le burn du début du tour où elle tombe compris (elle tombe juste après les statuts du début de tour). Requiem le tue quand même. Aussi sur un terrain (Fortification). Nouveau sens du 2026-11-10 (Carapace, Fortification, Tortank de Tibo), §10. |

Un **bonus ou malus de stat** s'écrit « ATK +2 », « mobilité +1 », « portée −1 », « PV max +3 » (`StatKey` : `atk`, `mobility`, `range`, `maxHp`) ; la mobilité n'a que le bonus, son malus est le slow. PV max +X / −X change aussi les PV de X (sans descendre sous 1) ; à la fin, les PV max reviennent et les PV sont plafonnés, sans jamais tuer. Mobilité +X pris pendant son tour compte aussitôt.

- Un statut disparaît au début du tour qui suit son échéance (§5.5), avant tout le reste. Pendant N tours, il touche chacun des N prochains tours du camp de l'unité.
- **Ordre du début de tour** (§4.2) : échéances, revenus, passifs (Ki né), zones, puis **Récupération et Absorbation** (+PV), puis les statuts : requiem, burn, **Absorbé**, puis la mobilité.
- **Cumul** : les statuts du même type se cumulent (deux burn 1 : 2 PV ; deux slow 1 : 2 de mobilité ; deux Absorbé : deux pertes). **Exception : Camouflage et Invisible** (statuts, mot-clé du Farceur, aura du Terrain de jeu) : on garde la plus grande portée, sans somme.
- Un monstre stun ou immobilisé perd aussitôt sa mobilité restante. Au début de son tour, sa mobilité est celle de sa carte, plus ses auras et ses mobilité +X, moins ses slow, ou 0 s'il est stun ou immobilisé. Un slow pris pendant son tour réduit aussitôt sa mobilité restante, sans descendre sous 0.
- Sur un terrain, seuls burn et carapace s'appliquent (Fortification).
- **Malus** : la catégorie des statuts qui gênent (le tableau « Malus » ci-dessus). « Retire ses malus » (Cure) les retire tous (§5.4).
- Ne sont **pas** des statuts : les bonus de tour (Dopage, Seringue, Flèche divine, Charge, Terrain de chasse : « jusqu'à la fin du tour », avec leur source), les bonus définitifs (Bénédiction), les auras (tant qu'on est dans la zone, sans durée), et l'état **Armé** (Archers impériaux : la prochaine attaque porte un bonus, un seul à la fois). Les effets instantanés « Absorbe N PV », les soins et la Soif ne changent pas.
- Aucune carte n'utilise encore Absorbé, Absorbation, Récupération, Désarmé ni Vol (statut) : ils sont dans le moteur (`addStatus`, effet `status`) pour les prochaines cartes. Hurlements pose ATK −1.

## 6. Grimoire de test (25 cartes)

Les tableaux de cartes (§6, §6 bis, §6 ter) s'écrivent avec le lexique (§5). Un test compare chaque ligne aux données du moteur (coût, stats, colonne « Effet ») : une carte modifiée ici doit l'être aussi dans `src/engine/cards.ts`, et inversement.

Les 20 cartes ci-dessous, plus les 5 premières cartes communes (§6 ter : Invocateur, Téléporteur, Terrain drainant, Terrain piégé, Zone d'invocation) en 1 exemplaire : c'est le deck Classique, le deck d'essai, qui garde 25 cartes (§10, 2026-11-10).

### Monstres (14)

| Carte | Qté | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|---|
| Éclaireur | 2 | 3 | 5 | 6 | 3 | 1 | — |
| Milicien | 2 | 2 | 2 | 3 | 2 | 1 | — |
| Archer | 2 | 2 | 2 | 1 | 2 | 2 | — |
| Chaman | 1 | 2 | 1 | 3 | 2 | 1 | Actif (1 mana) · un allié dans un carré de 1 · soin 2 |
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
| Boule de feu | 2 | Un ennemi dans un carré de 3 d'une de vos unités · 1 dégât |
| Charge | 2 | Un allié · +2 mobilité (pour ce tour) |
| Bourrasque | 2 | Un ennemi · recul 2, direction au choix |
| Bénédiction | 1 | Un allié · +1 ATK +1 PV (définitivement) |

### Terrains (2)

| Carte | Coût | PV | Effet |
|---|---|---|---|
| Autel de mana | 2 | 1 | La zone rapporte 2 mana au lieu de 1 (le VP reste à 1) |
| Bastion | 2 | 10 | — |

## 6 bis. Decks pré-construits

Chaque joueur choisit son deck avant la partie, parmi : **Classique** (le grimoire de test du §6), **Archers impériaux**, **Maîtres des pièges**, **Dragons élémentaires**, **Sorciers du feu**, **Explorateur du temps** et **Vampire** (plus de deck Bodybuilder depuis le 2026-11-10 : ses cartes gardent leurs données). Pas de deckbuilding. Chaque deck fait **30 cartes** (le Classique, deck d'essai : 25), 3 exemplaires au plus d'une même carte : ses cartes propres (l'archétype, chacune ×3), puis des cartes de base (§6) et des cartes communes (§6 ter), avec les quantités de sa composition ci-dessous (tableau « Composition » du doc « Cartes du TCG », donnée le 2026-11-10). Ses cartes propres s'appellent « Nom - Archétype », l'archétype étant le nom du deck (§5.1) ; dans les compositions, on les écrit par leur nom seul.

### Deck Archers impériaux

Remplace entièrement l'ancien deck Archers (remaniement du 2026-11-08, §10). Les 4 monstres, le Camps de tir et la Flèche divine sont de l'archétype Archers impériaux (code `archer`). « Rôle » (Rusher, Tireur) : information de la fiche, sans règle.

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Écuyer des archers - Archers impériaux | 1 | 0 | 3 | 6 | 0 | Aura · Carquois prêt ! · archers impériaux alliés, carré de 1 · 2 attaques par tour |
| Archer impérial - Archers impériaux | 2 | 2 | 2 | 3 | 4 | Actif (1 mana, sans limite par tour) · Flèche explosive · armé : prochaine attaque, 1 dégât aux ennemis, carré de 1 de la cible (ou d'une case vide visée) |
| Arbalétrier impérial - Archers impériaux | 3 | 4 | 2 | 3 | 3 | Actif (1 mana, sans limite par tour) · Carreau perforant · armé : prochaine attaque, +2 ATK |
| Trébuchet des archers - Archers impériaux | 4 | 5 | 2 | 2 | 6 | Siège ×2 ; ne peut pas attaquer au contact |

| Carte | Coût | Effet |
|---|---|---|
| Flèche divine - Archers impériaux | 2 | Un allié archer impérial · +1 ATK +1 portée (pour ce tour) |

| Carte | Coût | PV | Effet |
|---|---|---|---|
| Camps de tir - Archers impériaux | 2 | 5 | Aura · archers impériaux alliés, sa case et carré de 1 · +1 portée |

Composition (30, donnée le 2026-11-10) : Écuyer, Archer impérial, Arbalétrier impérial, Trébuchet des archers, Flèche divine, Camps de tir (×3) ; base : Bourrasque ×3, Charge ×3, Bastion ×1 ; communes : Zone d'invocation, Terrain piégé, Téléporteur, Flash, Carapace (×1).

Cartes sans deck, gardées pour leurs mécaniques (Trophée, Pillage, Givre, Brûlure, Siège) et les tests, comme Jean Bon (§10) :

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Archer léger - Archers | 1 | 1 | 3 | 5 | 2 | Trophée 1 |
| Archer lourd - Archers | 3 | 3 | 3 | 3 | 2 | Pillage 1 |
| Archer de glace - Archers | 3 | 2 | 3 | 3 | 2 | Givre 1 |
| Archer du feu - Archers | 3 | 2 | 3 | 3 | 2 | Brûlure 1 |
| Trébuchet | 5 | 4 | 1 | 2 | 5 | Siège ×2 |
| Monstre de test | 10 | 3 | 7 | 9 | 1 | — |

Les quatre archers sont de l'archétype Archers impériaux (code `archer`) ; le Trébuchet et le Monstre de test sont génériques, sans archétype.

### Deck Maîtres des pièges

Anciennement « Pièges » (renommé le 2026-11-08, id technique `pieges` inchangé). Les 4 monstres sont de l'archétype Piège, qui s'affiche « Maîtres des pièges » (« maîtres des pièges »). « Rôle » (Contrôleur, Assassin) : information de la fiche, sans règle.

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Poseur de piège - Maîtres des pièges | 2 | 1 | 1 | 7 | 1 | Actif (1 mana) · Filet · piège une case libre, carré de 1 (3 tours adverses) · immobilisé jusqu'à son prochain tour |
| Farceur - Maîtres des pièges | 3 | 2 | 1 | 7 | 1 | Camouflage ; Attaque par surprise ×2 |
| Poseur de bombe - Maîtres des pièges | 2 | 1 | 1 | 7 | 1 | Actif (1 mana) · Bombe · piège une case libre, carré de 1 (3 tours adverses) · 3 dégâts |
| Clown assassin - Maîtres des pièges | 4 | 3 | 2 | 7 | 1 | Attaque par surprise ×3 |

| Carte | Coût | Effet |
|---|---|---|
| Pénombre - Maîtres des pièges | 5 | Tous les maîtres des pièges alliés · camouflage pendant 1 tour |

| Carte | Coût | PV | Effet |
|---|---|---|---|
| Terrain de jeu - Maîtres des pièges | 3 | 5 | Aura · maîtres des pièges alliés, sa case et carré de 1 · invisible |

Composition (30, donnée le 2026-11-10) : Poseur de piège, Farceur, Poseur de bombe, Clown assassin, Pénombre, Terrain de jeu (×3) ; communes : Repli ×3, Carapace ×3, Terrain piégé ×2, Flash ×1, Réanimation ×1, Zone d'invocation ×1, Fatigue ×1 (plus de Boule de feu ni de Bénédiction).

### Deck Dragons élémentaires

Refait le 2026-11-08 (§10). Les 5 monstres, Hurlements et le Nid de dragons sont de l'archétype Dragons élémentaires (code `dragon`, « dragon élémentaire » au singulier), Jeune dragon compris.

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Jeune dragon - Dragons élémentaires | 2 | 3 | 2 | 4 | 1 | Actif (3 mana) · Évolution draconique |
| Ignis - Dragons élémentaires | 7 | 6 | 6 | 6 | 1 | Vol ; Actif (3 mana) · Lance-flamme · 3 cases en ligne et 2 diagonales devant, direction au choix · 2 dégâts + burn 2 pendant 1 tour |
| Aqua - Dragons élémentaires | 7 | 5 | 10 | 5 | 1 | Vol ; Actif (3 mana) · Tsunami · 3 cases en ligne et 2 diagonales devant, direction au choix · 2 dégâts + slow 2 pendant 1 tour |
| Ventus - Dragons élémentaires | 7 | 5 | 5 | 8 | 1 | Vol ; Actif (3 mana) · Tempête · 3 cases en ligne et 2 diagonales devant, direction au choix · 2 dégâts + recul 2, vers l'avant |
| Terra - Dragons élémentaires | 7 | 9 | 5 | 5 | 1 | Vol ; Actif (3 mana) · Séisme · carré de 2 · 3 dégâts |

| Carte | Coût | Effet |
|---|---|---|
| Hurlements - Dragons élémentaires | 1 | Un dragon élémentaire allié · ennemis, carré de 5 de la cible · ATK −1 pendant 1 tour |

| Carte | Coût | PV | Effet |
|---|---|---|---|
| Nid de dragons - Dragons élémentaires | 3 | 5 | Aura · dragons élémentaires alliés, sa case et carré de 1 · effets actifs à 1 mana |

Un dragon élémentaire s'invoque normalement pour 7 mana, ou par l'Évolution draconique d'un Jeune dragon (3 mana, §5.4, §10) : le Jeune dragon se sacrifie et le dragon choisi apparaît à sa place, sans payer son coût, stun jusqu'à son prochain tour.

Composition (30, donnée le 2026-11-10) : Jeune dragon, Ignis, Aqua, Ventus, Terra, Hurlements, Nid de dragons (×3) ; base : Autel de mana ×3 ; communes : Fortification ×3, Élixir de mana ×2, Invocateur ×1.

Carte sans deck depuis le 2026-11-08, gardée pour ses mécaniques (Vol, aura) et les tests :

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Origine - Dragons élémentaires | 10 | 7 | 7 | 7 | 1 | Vol ; Aura · dragons élémentaires alliés, carré de 1 · +1 ATK +1 PV +1 mobilité |

### Cartes Bodybuilder (plus de deck depuis le 2026-11-10)

Le deck Bodybuilder est retiré le 2026-11-10 (§10) : ses cartes ne sont plus dans aucun deck, mais gardent leurs données pour leurs mécaniques (auras de PV et de mobilité, soin de début de tour, carapace, requiem de la Seringue) et les tests. Remanié le 2026-11-06 (validé) : Jeune Gomuscu et Jean Bon quittent le deck, Rudy et Tibo arrivent. Les 4 monstres sont de l'archétype Bodybuilder. Les auras et le soin de début de tour portent sur le carré de 2.

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Rudy - Bodybuilder | 4 | 3 | 3 | 7 | 1 | Aura · bodybuilders alliés, carré de 2 · +1 mobilité |
| Arnold - Bodybuilder | 8 | 8 | 4 | 4 | 1 | Aura · bodybuilders alliés, carré de 2 · +1 ATK |
| Tibo - Bodybuilder | 4 | 3 | 8 | 3 | 1 | Actif (1 mana) · Tortank · lui-même · carapace jusqu'à son prochain tour |
| Ki né - Bodybuilder | 2 | 3 | 3 | 4 | 1 | Début de tour · bodybuilders alliés, carré de 2 · soin 1 |

Cartes hors deck (données gardées pour les mécaniques « Quand il détruit une unité » et Dopage ; plus dans aucun grimoire) :

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Jeune Gomuscu - Bodybuilder | 2 | 2 | 2 | 3 | 1 | Quand il détruit une unité · +1 ATK +1 PV (définitivement) |
| Jean Bon - Bodybuilder | 3 | 5 | 3 | 3 | 1 | Actif (2 mana) · Dopage · lui-même · +2 ATK (pour ce tour) + burn 1 pendant 2 tours |

| Carte | Coût | Effet |
|---|---|---|
| Seringue - Bodybuilder | 2 | Un allié bodybuilder · ATK ×2 (pour ce tour) + requiem |

| Carte | Coût | PV | Effet |
|---|---|---|---|
| Salle de sport - Bodybuilder | 2 | 4 | Aura · bodybuilders alliés, sa case et carré de 1 · +1 ATK +1 PV |

Ancienne composition (25, jusqu'au 2026-11-10) : Rudy ×3, Arnold ×3, Tibo ×3, Ki né ×3, Seringue ×2, Salle de sport ×1 ; complément : Charge ×3, Bénédiction, Bastion (×1) ; communes : Invocateur, Téléporteur, Terrain drainant, Terrain piégé, Zone d'invocation (×1).

### Deck Sorciers du feu

Les 4 monstres sont de l'archétype Sorcier du feu. Brûlure 1, 2 tours : à l'attaque, la cible est burn 1 pendant 2 tours.

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Feria - Sorciers du feu | 2 | 1 | 3 | 5 | 2 | Brûlure 1, 2 tours |
| Lutin brasier - Sorciers du feu | 2 | 1 | 3 | 6 | 1 | Actif (1 mana) · une case libre, carré de 2 · case brûlée pendant 3 tours : 1 dégât + burn 1 pendant 1 tour |
| Archimage - Sorciers du feu | 6 | 3 | 7 | 5 | 2 | Brûlure 1, 2 tours ; Actif (1 mana) · carré de 2 · burn 2 pendant 2 tours |
| Golem de lave - Sorciers du feu | 4 | 2 | 12 | 3 | 1 | Zone · carré de 1 · burn 1 pendant 1 tour |

| Carte | Coût | Effet |
|---|---|---|
| Brûlure en chaîne - Sorciers du feu | 2 | Tous les ennemis dans un carré de 1 d'une de tes unités · burn 1 pendant 2 tours |

Composition (30, donnée le 2026-11-10) : Feria, Lutin brasier, Archimage, Golem de lave, Brûlure en chaîne (×3) ; communes : Terrain drainant ×3, Zone d'invocation ×3, Téléportation ×3, Fatigue ×3, Puissance ×2, Flash ×1.

### Deck Explorateur du temps

Les 4 monstres sont de l'archétype Explorateur du temps. Ils ont tous « Retour vers le futur » : il revient sur une case libre de son chemin du tour (§5.4, §10). Remaniement du 2026-11-08 (§10).

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Apprenti - Explorateur du temps | 2 | 2 | 4 | 4 | 1 | Actif (1 mana) · Retour vers le futur · retour |
| Chronomancienne - Explorateur du temps | 4 | 3 | 3 | 7 | 1 | Actif (1 mana) · Retour vers le futur · retour ; Actif (1 mana) · Sablier du temps · piège une case libre, carré de 1 (3 tours adverses, un seul à la fois) · remonte 3 cases |
| Dragonnet - Explorateur du temps | 4 | 3 | 4 | 5 | 1 | Actif (1 mana) · Retour vers le futur · retour ; Actif (3 mana) · Miroir de souvenirs · un ennemi dans un carré de 1 · stun pendant 1 tour · contre-coup : silence pendant 1 tour |
| Maître du temps - Explorateur du temps | 7 | 5 | 5 | 7 | 1 | Actif (1 mana) · Retour vers le futur · retour ; Actif (2 mana) · Requiem · un ennemi dans un carré de 1 · requiem |

Maître du temps : « Un ancien explorateur, qui s'est perdu entre les époques. Physiquement jeune, mais très vieux dans les faits. » (texte d'ambiance).

| Carte | Coût | Effet |
|---|---|---|
| Piège temporel - Explorateur du temps | 5 | Tous les ennemis · immobilisé pendant 1 tour |

| Carte | Coût | PV | Effet |
|---|---|---|---|
| Fissure temporelle - Explorateur du temps | 3 | 4 | Passage · carré de 1 · immobilisé jusqu'à son prochain tour |

Composition (30, donnée le 2026-11-10) : Apprenti, Chronomancienne, Dragonnet, Maître du temps, Piège temporel, Fissure temporelle (×3) ; communes : Fatigue ×3, Puissance ×3, Téléportation ×2, Terrain piégé ×2, Flash ×1, Zone d'invocation ×1.

### Deck Vampire

Les 4 monstres (et la forme chauve-souris d'Emma) sont de l'archétype Vampire. Soif 1 : à l'attaque, il récupère 1 PV.

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Delta - Vampire | 3 | 4 | 4 | 4 | 1 | Soif 1 |
| Emma - Vampire | 2 | 3 | 4 | 3 | 1 | Soif 1 ; Actif (1 mana, sans limite par tour) · se transforme en Emma chauve-souris |
| Vladimir - Vampire | 5 | 4 | 7 | 5 | 1 | Soif 1 ; Actif (1 mana) · carré de 1 · absorbe 1 PV |
| Zoldik - Vampire | 6 | 4 | 8 | 5 | 1 | Soif 1 ; Actif (3 mana, puis plus d'attaque ce tour) · un ennemi dans un carré de 1 · absorbe tous ses PV sauf 1 |

Forme d'Emma, hors grimoire (elle n'apparaît que par la transformation, §10) :

| Carte | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|
| Emma chauve-souris - Vampire | 1 | 1 | 8 | 1 | Soif 1 ; Actif (1 mana, sans limite par tour) · se transforme en Emma |

| Carte | Coût | Effet |
|---|---|---|
| Appel du sang - Vampire | 4 | Tous les vampires alliés · +2 mobilité (pour ce tour) |
| Sacrifice sanguinaire - Vampire | 1 | Un allié vampire · perd tous ses PV sauf 1 + +1 ATK par PV perdu (pour ce tour) |

| Carte | Coût | PV | Effet |
|---|---|---|---|
| Terrain de chasse - Vampire | 1 | 3 | Au déplacement · vampires alliés, sa case et carré de 1 · +1 mobilité (pour ce tour) |

Le Terrain de chasse est un terrain de l'archétype Vampire depuis le 2026-11-10 (ex-carte commune) : son bonus ne vaut que pour ses vampires (§10).

Composition (30, donnée le 2026-11-10) : Delta, Emma, Vladimir, Zoldik, Appel du sang, Sacrifice sanguinaire, Terrain de chasse (×3) ; communes : Cure ×3, Carapace ×3, Puissance ×2, Flash ×1.

## 6 ter. Cartes communes

Génériques (sans archétype), elles complètent les decks, chacun avec ses propres quantités (composition du §6 bis). Les 11 sorts génériques sont arrivés le 2026-11-10 (§10) ; Soin n'est dans aucun deck pour l'instant.

| Carte | Coût | ATK | PV | Mob. | Portée | Effet |
|---|---|---|---|---|---|---|
| Invocateur | 4 | 1 | 3 | 3 | 2 | Actif (1 mana) · une case libre, carré de 1 · invocation |
| Téléporteur | 4 | 1 | 3 | 3 | 2 | Actif (2 mana) · un allié · téléportation sur une case libre, carré de 1 |

| Carte | Coût | PV | Effet |
|---|---|---|---|
| Terrain drainant | 1 | 4 | Passage · carré de 1 · 1 dégât |
| Terrain piégé | 1 | 4 | Passage · carré de 1 · slow 1 jusqu'à son prochain tour |
| Zone d'invocation | 1 | 4 | Point d'invocation |

| Carte | Coût | Effet |
|---|---|---|
| Puissance | 2 | Un allié · +2 ATK (pour ce tour) |
| Soin | 2 | Un allié · soin 5 |
| Flash | 3 | Un allié · téléportation sur une case libre à 2 cases au plus de la cible, sans obstacle |
| Fatigue | 3 | Un ennemi · slow 2 pendant 1 tour |
| Carapace | 3 | Un allié · carapace jusqu'à son prochain tour |
| Élixir de mana | 0 | +1 mana |
| Cure | 2 | Un allié · retire ses malus |
| Repli | 2 | Un allié · téléportation sur une case d'invocation libre de son camp |
| Téléportation | 3 | Un allié · téléportation sur un de ses terrains sans monstre |
| Réanimation | 5 | Un monstre de son cimetière · invoqué sur une case d'invocation libre de son camp, sans payer son coût |
| Fortification | 3 | Un de ses terrains · carapace jusqu'à son prochain tour |

## 7. Interface (minimale)

- Accueil (`/`) : choix de la carte, du mode (Normal ou Contestation, §4.4 bis, sur les cartes qui le proposent), des VP pour gagner (§4.10), de l'économie (Classique ou Réserve) et des réglages du mana (génération max, limite, §4.2), du minuteur (sans, ou 3 minutes de réflexion par tour, §4.2), des cartes (d'origine, ou celles de l'atelier s'il a des réglages, §2), du deck de chaque joueur et de qui joue J2 (un humain ou l'IA), puis la partie se lance sur `/game` (réglages dans l'adresse : recharger la page relance une partie avec les mêmes). En jeu, « Nouvelle partie » ramène à l'accueil ; l'écran de victoire propose de rejouer avec les mêmes réglages.
- Plateau au centre, cases cliquables, unités affichées avec ATK / PV actuels / mobilité restante.
- Panneau du joueur actif : mana, VP, grimoire (cartes jouables en surbrillance, coût visible).
- Score de chaque joueur (encoche des scores, en haut au centre, le plateau passant derrière) : mana, VP et leur progression vers la victoire, nombre de cartes restantes (au survol), et deux compteurs à leur nom, « Plateau » et « Cimetière », qui ouvrent ces listes (§10).
- Sélection d'un monstre → surbrillance des cases atteignables et des cibles attaquables. Clic sur une cible → bulle d'action : attaquer, attaquer et avancer (si l'attaque la détruit au contact, §4.7), effets du monstre. Clic droit sur un de ses monstres → ses effets actifs.
- Sélection d'un monstre adverse → surbrillance des cases qu'il pourra atteindre à son prochain tour (mobilité complète moins le givre, plateau actuel).
- Sélection d'une carte → surbrillance des cibles valides.
- Journal des actions, en bas à gauche, repliable (§10).
- Bouton « Fin du tour » et écran de passage hotseat.
- Écran de chargement du plateau (2026-11-10) : il couvre l'écran de jeu tant que le plateau n'est pas dessiné (sol peint, cases, unités), et attend jusqu'à 8 secondes le décor autour du plateau ; pendant ce temps, rien ne se joue (animations, IA, minuteur). Le plateau se prépare dès que la carte est connue (accueil, lancer de dés, salle en ligne).
- Écran de victoire.

## 7 bis. IA d'entraînement

Pour tester le jeu seul : au lancement d'une partie, « J2 joué par : l'IA ». Pas de niveau de difficulté.

- L'écran montre toujours la vue de J1 ; pas d'écran de passage. Pendant le tour de l'IA, on la regarde jouer : une action à la fois, animée, avec une courte pause entre deux.
- À chaque action, l'IA note toutes ses actions légales : une action vaut la position après elle, ou après la meilleure action suivante du même monstre (un sort ou un effet qui le renforce puis son attaque, un déplacement ou une invocation puis une attaque, une attaque puis un repli). Puis elle cherche : pour les meilleures, elle joue la suite de son tour dans sa tête et garde celle qui finit le mieux, dans un budget de calcul fixe (pour rester rapide sur téléphone). Quand plus rien ne l'améliore, elle finit son tour. Elle ne compte pas comme menacées les unités que l'adversaire ne voit pas (Farceur, Pénombre).
- Ce que chaque camp risque au prochain tour adverse : chaque monstre frappe une fois par attaque qu'il a (deux pour un archer que couvre un Écuyer), après s'être déplacé ; il détruit d'abord ce qui rapporte le plus, puis entame ce qui reste. Les distances se comptent en cases de marche (murs et falaises font faire le tour). Une attaque compte avec ce qu'elle fera perdre ensuite (la Brûlure de l'attaquant, la Zone du Golem de lave au contact), et avec la portée du Camps de tir depuis les cases qu'il couvre ; le Trébuchet ne frappe jamais au contact.
- Burn : l'IA compte les PV que les burn d'une unité lui feront encore perdre, au début des tours de son camp, jusqu'à leur fin. Un monstre que ses burn vont détruire compte déjà comme perdu, et son VP comme gagné par l'autre camp (un peu moins qu'un VP, un soin pouvant le sauver) : elle ne gaspille ni une attaque ni une Boule de feu sur lui. Une case brûlée ne vaut presque rien si aucun ennemi ne peut y entrer à son prochain tour, et vaut plus dans la zone d'une mana zone.
- Un bonus du tour (Flèche divine, Dopage) ou un carreau armé (Carreau perforant, Flèche explosive) se perd à la fin du tour : il n'entre pas dans la valeur d'un monstre. L'IA n'arme donc un archer que pour un tir du même tour qui en profite.
- Effets actifs : un effet inutilisé est perdu pour le tour, une carte reste au grimoire. L'IA pose donc ses monstres et terrains après ses déplacements, attaques et effets utiles, et un effet utile passe avant un monstre ou un terrain qui lui prendrait son mana. Après un déplacement, elle regarde aussi l'effet que le monstre pourrait lancer de sa nouvelle case (Mage, Chaman, dragons). Les sorts se jouent quand ils sont les meilleurs. La position se juge sur les VP, la valeur des unités, les mana zones tenues, la marche vers les zones à prendre, ce que chaque camp risque de perdre au prochain tour adverse, et un peu le mana en réserve.
- Mana zones : une zone que l'adversaire tient à la fin du tour de l'IA lui rapporte aussitôt (VP et mana, au début de son tour) ; une zone que l'IA tient ne lui rapporte qu'au début de son tour suivant, et moins sûrement si un monstre adverse peut venir la contester d'ici là. Contester une zone adverse vaut donc à peu près un VP : elle y envoie volontiers un petit monstre, même s'il risque d'y être détruit. Une zone que tient un de ses terrains n'a pas besoin de gardien : ses monstres repartent vers les autres.
- Échanges : un monstre qu'un allié pourra venger (détruire son tueur au tour suivant) coûte moins à perdre ; l'IA se risque donc plus volontiers, et l'adversaire n'est pas censé faire un échange perdant.
- Sorts et effets : un effet actif ou un sort doit rapporter plus que son mana. Un sort gardé au grimoire garde une valeur (il servira à un moment décisif) : l'IA ne le lance que s'il rapporte davantage, une destruction, une zone prise ou contestée, une unité sauvée, pas pour un bonus sans suite (pas de Bénédiction au premier tour, pas de Boule de feu qui ne fait qu'entamer). Un sort ou un effet ne prend pas à son compte ce que l'action suivante aurait rapporté sans lui. Un sort ou un effet qui touche plusieurs monstres à la fois (Appel du sang, Pénombre, Piège temporel, Brûlure en chaîne) ne rapporte souvent qu'après les actions de plusieurs monstres : l'IA l'essaie toujours dans sa recherche, avec la suite de son tour, au lieu de le juger sur la position juste après lui (2 au plus par action, §10).
- Pièges : un piège ne vaut rien si aucun monstre adverse ne peut marcher dessus avant qu'il disparaisse (à la fin de sa durée, 3 tours adverses pour Filet, Bombe et Sablier) ; il vaut d'autant plus qu'il est près d'une mana zone.
- Pas d'allers-retours : une action n'est notée avec l'effet qui la suivrait que si cet effet serait joué, et deux actions valent un peu moins que le même résultat en une seule.
- Un monstre qui change de forme (Emma) vaut la meilleure de ses deux formes : il y revient quand il veut, en payant le mana.
- Elle ne triche pas : elle ne voit ni les monstres invisibles adverses, ni les pièges adverses, ni le grimoire adverse.
- Elle est dans `src/ai/`, hors du moteur, qu'elle utilise comme l'interface.

## 7 ter. Parties en ligne (en cours)

Jouer à deux à distance, sans compte ni matchmaking : un lien d'invitation à envoyer (décidé et validé le 2026-11-10). Plan en 6 lots : (1) moteur et écran prêts, sans serveur — **fait** ; (2) la salle de jeu, logique pure et testée — **faite** ; (3) le serveur Cloudflare (Workers et Durable Objects, offre gratuite : une salle par partie) — **fait**, essayé en local ; (4) l'écran en ligne — **fait**, essayé en local à deux onglets ; (5) les cartes de l'atelier en ligne ; (6) la mise en ligne — **faite le 2026-11-10** : le jeu est en ligne sur https://tcg-tactique.kami-joss.workers.dev (Cloudflare, offre gratuite, compte de l'utilisateur), par `npm run deploy` (tout est vérifié avant l'envoi ; rien n'est en ligne sans cette commande, une modification du code n'y part pas toute seule) ; l'essai de bout en bout y passe (`node scripts/online-check.mjs <adresse> <version>`).

- **Un serveur fait autorité**, avec le même moteur : il vérifie et applique chaque coup, et n'envoie à chaque joueur que sa vue (§2), les animations de cette vue et la ligne du journal ; jamais l'action d'un coup adverse, qui peut contenir la case d'un piège ou d'un monstre invisible.
- **Parcours** : à l'accueil, « Joueur 2 : en ligne » (le deck de J2 n'y est pas : l'invité le choisit), puis « Créer la partie en ligne » ; l'hôte arrive dans sa salle d'attente, avec le lien à copier et les réglages. L'invité qui ouvre le lien voit les réglages et le deck de l'hôte, choisit son deck et « Rejoindre la partie ». Les deux voient le lancer de dés : seul le gagnant choisit qui commence. En partie, l'écran de jeu habituel : les coups adverses s'animent comme ceux de l'IA, un bandeau dit « Connexion perdue : reconnexion… » ou « Ton adversaire s'est déconnecté », les options proposent « Abandonner la partie » (confirmée), et « Nouvelle partie » prévient que la partie continue sans lui. Pages d'erreur : lien déjà utilisé, jeu mis à jour (recharger la page), partie introuvable. En ligne, la partie se joue avec les cartes d'origine pour l'instant (lot 5).
- **Lien d'invitation à usage unique** : le premier qui l'ouvre prend la place. L'invité choisit son deck en arrivant. L'hôte est J1, l'invité J2 (mêmes places qu'en local) ; le lancer de dés décide qui commence (§4.1). À l'accueil : « Joueur 2 : en ligne (lien) ».
- **Serveur** : un Worker Cloudflare sert le site et une salle par partie (Durable Object). Créer une partie : `POST /api/parties` (réglages et deck de l'hôte → identifiant de la partie et jeton de l'hôte) ; chaque joueur se connecte à `/api/parties/<id>/ws` ; le lien d'invitation est `/partie/<id>`. Les connexions restent ouvertes pendant la veille de la salle, qui garde la partie dans son stockage à chaque message ; une alarme la réveille pour le chrono et pour le ménage.
- Une partie n'a pas à survivre à un redémarrage du serveur (le stockage de la salle la garde quand même) ; une salle sans message depuis 24 heures est effacée.
- **Places et jetons** : chaque joueur reçoit un jeton secret, gardé par son navigateur, qui le reconnaît s'il se reconnecte (un deuxième onglet du même joueur est accepté). Sans jeton, on ne peut que voir la salle d'attente (réglages et deck de l'hôte) et rejoindre la place libre. Un écran d'une autre version du jeu est refusé : il faut recharger la page. Un coup refusé n'est dit qu'à son auteur. Chacun sait quand l'autre se déconnecte ou revient.
- **Minuteur** (option « Minuteur », §4.2) : le serveur tient l'horloge et finit le tour à 0:00. Il ne voit pas les animations : après chaque coup, et au début de chaque tour, le chrono attend que l'écran du joueur actif signale leur fin, 10 secondes au plus. Les deux joueurs voient le temps du joueur actif.
- **Abandon** : seulement en ligne (en local, « Nouvelle partie » suffit), à tout moment, même pendant le tour adverse : l'adversaire gagne aussitôt, et l'écran de victoire le dit (« Le Joueur 2 abandonne. »).
- **Absence** : un joueur déconnecté voit ses tours passer à la fin de son temps ; il perd la partie après 2 tours de suite passés ainsi sans être connecté, et l'écran de victoire le dit (« Le Joueur 2 a quitté la partie. »).
- **Info cachée** : tout ce que reçoit un joueur se lit dans son navigateur. Un test permanent vérifie, sur des parties jouées au hasard avec les decks qui cachent le plus, que les actions légales du joueur actif sont les mêmes avec ou sans ce qu'il ne voit pas, et que sa vue ne contient ni un monstre qui lui est invisible ni sa case, ni les pièges ni le grimoire adverses. Un événement peut nommer un monstre invisible sans sa case : une carte jouée vers lui, l'effet d'un monstre visible sur lui, le poseur du piège où un monstre vient d'entrer. Les VP et le mana d'une mana zone tenue par un monstre invisible restent publics (§10).

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
- Multijoueur en ligne : en cours, voir §7 ter.
- Règle de priorité entre effets qui se déclenchent en même temps. En attendant : sur une case où entre un monstre, les pièges de la case passent avant les terrains « Passage » (§10).
- Plusieurs cartes de plateau. (Trois autres cartes, « Champ de bataille » 11 × 11, 13 × 13 et 15 × 15, sont déjà jouables : voir §3.)
- Régler les effets des cartes dans l'atelier de cartes (ciblages, types d'effets, statuts et leurs valeurs) : trop de mécaniques pour l'instant (décision du 2026-11-09). L'atelier règle le coût, les stats, la valeur des mots-clés et, depuis le 2026-11-10, le coût de chaque effet actif.

## 10. Clarifications validées

Réponses aux questions posées pendant le développement. Elles font autorité au même titre que le reste du document.

- **Doc des règles (validé)** : ordre du début de tour = revenus (mana, VP), puis effets passifs, puis statuts (requiem, burn) ; les slow se cumulent ; Camouflage = rayon 2 (monstres et terrains adverses, pas la zone d'invocation) ; « Passage » à chaque case en marchant (une fois par recul) ; archétype et famille sont un seul mot, « archétype », le Trébuchet est une carte générique ; le cimetière remplace la pile « utilisées » ; tous les effets de monstres sont « une fois par tour/carte » ; les sorts n'ont pas de limite par tour, seul le mana compte.
- **§5.4 — Téléportation (validé, 2026-11-06)** : une téléportation (Téléporteur, Retour, sablier de la Chronomancienne) ne passe par aucune case entre les deux, mais le monstre **entre sur sa case d'arrivée** : tout ce qui y inflige un effet se déclenche, comme pour un déplacement (piège ennemi, « Passage » d'un terrain dont la zone contient la case, case brûlée, « Zone » du Golem de lave : un ennemi téléporté dans la zone est burn, et un Golem téléporté à côté d'un ennemi le brûle). Remplace la règle précédente (« rien ne s'y déclenche », elle-même venue remplacer une règle où l'arrivée comptait comme une entrée). Une téléportation reste sans effet sur « Au déplacement » (Terrain de chasse) et ne coûte aucune mobilité. Si l'effet de la case est lui-même un sablier, le monstre remonte de nouveau (chaque piège ne se déclenche qu'une fois, le chemin raccourcit) ; un monstre détruit par l'arrivée l'est sur sa case d'arrivée.
- **§4.1 / §4.2 — Premier tour** : le début de tour s'applique dès le tour 1 ; le joueur qui commence a donc 3 mana.
- **§4.1 — Lancer de dés d'ouverture (validé, 2026-11-07)** : 1 dé à 6 faces par joueur, relancé en cas d'égalité (les égalités restent visibles à l'écran et au journal) ; le gagnant choisit s'il commence. Il n'y a plus de bonus de mana pour le second joueur (+1 mana au premier tour de J2 : supprimé). J1 et J2 ne changent pas de place quand J2 commence : le tour 1 est à J2, le tour 2 à J1, etc. Contre l'IA, si elle gagne, elle commence (l'humain clique pour lancer la partie) ; si l'humain gagne, il choisit. L'écran des dés remplace tout (rien de la partie n'est rendu) jusqu'au choix, comme le passage d'écran. Le lancer est tiré dans l'interface (`rollOpening`, `Math.random`), pas dans le moteur, qui reste déterministe : `createGame(…, first)` reçoit le joueur qui commence. Une nouvelle partie relance les dés.
- **§4.6 — Unités alliées** : on peut traverser les cases occupées par ses propres monstres **et** terrains, sauf un monstre allié stun ou immobilisé (validé). On ne peut pas s'arrêter sur une case qui contient un monstre. On peut s'arrêter sur une case qui ne contient qu'un terrain allié.
- **§4.6 — Arrêt forcé sur un allié (validé)** : un monstre arrêté en route sur la case d'un allié (immobilisé ou stun en y entrant, par un Passage ou un piège) revient sur la dernière case libre de son chemin, sans plus de mobilité ce tour, comme devant un monstre camouflé ; les effets déjà subis restent. Le slow d'un Terrain piégé ne pose pas ce problème : il est compté avant le déplacement, dans le coût du chemin.
- **§4.9 — Terrains** : on ne peut pas poser deux terrains sur la même mana zone.
- **§5 / §6 — Autel de mana + `etendard`** : les bonus se cumulent. Un Porte-étendard sur la case de son propre Autel de mana fait rapporter 3 mana à la zone (2 grâce à l'Autel, +1 grâce à l'étendard).
- **§6 — Chaman et Mage** : « un allié » / « un ennemi » désigne un monstre. Un terrain n'est pas un monstre : bien différencier les types de cartes.
- **§6 — Chaman** : on ne peut pas soigner un allié qui a déjà tous ses PV.
- **§6 — Boule de feu** : « 3 cases max (distance orthogonale) » = 3 pas au maximum depuis un de ses monstres, chemin en L possible, sans ligne de vue. **Remplacé le 2026-11-10** : carré de 3 d'une de ses unités, 1 dégât (voir plus bas).
- **§6 — Bourrasque** : un terrain du camp du monstre poussé n'arrête pas le recul ; le monstre peut finir dessus ou le traverser, comme pour un déplacement. La carte ne peut être jouée que dans une direction où le monstre recule d'au moins une case.
- **§5 — `riposte`** : ne se déclenche que contre une attaque, pas contre un effet activé (par exemple celui du Mage) ni contre un sort. Une seule riposte par tour : seule la première attaque adjacente du tour la déclenche.
- **§5 — `vol`** : survole uniquement les cases X ; les monstres et terrains ennemis le bloquent comme n'importe quel monstre (la §5 disait d'abord « traverse les ennemis », elle a été corrigée). `vol` ne joue que quand le monstre se déplace lui-même : poussé par Bourrasque, il s'arrête avant une case X comme les autres.
- **§3 — Falaises** : une falaise ne se franchit pas en se déplaçant, sauf avec `vol` qui survole celles de la Scierie. La **Mine** est une zone fermée : on n'y entre et on n'en sort que par ses ouvertures, même avec `vol`, et ses falaises coupent la ligne de vue de toutes les attaques et de l'effet du Mage, même au contact. Celle de la **Scierie** laisse passer les tirs de portée 2 ou plus (Archer, Mage, effet du Mage), même sur une cible juste derrière ; un monstre de portée 1 ne frappe pas à travers. Le soin du Chaman (portée 1, adjacent) ne passe aucune falaise. La Boule de feu (3 pas sans ligne de vue) les ignore. Toute falaise arrête le recul de Bourrasque, y compris pour un monstre `vol`. Les effets de hauteur et de fosse ne sont pas calculés en v1.
- **§6 bis — `trophee` / `pillage`** : « adjacent » = au contact au moment de l'attaque ; seule l'attaque compte (pas les sorts ni les effets).
- **§6 bis — `givre`** : pose slow 1 pendant 1 tour, compté en tours du camp de la cible (§5.5) ; il se cumule ; sans effet sur un terrain.
- **§6 bis — `brulure`** : pose burn 1 pendant 1 tour, compté en tours du camp de la cible (§5.5) ; la perte de PV a lieu au début de chaque tour affecté (après ses revenus et les passifs, §4.2) ; elle se cumule ; les terrains brûlent aussi ; une destruction rapporte le VP au joueur de l'archer.
- **§5 bis — Statuts** : un monstre stun ne riposte pas. Le filet du Poseur de piège immobilise jusqu'au début du prochain tour du monstre : pris pendant son propre tour, il ne bouge plus de ce tour et il est libre au suivant.
- **§6 bis — Trébuchet** : portée 5 avec les règles de tir habituelles ; il passe donc la falaise de la Scierie.
- **§6 bis — Monstre de test** (validé) : monstre du deck Archers pour tester les abus de stats (10 mana, ATK 3, PV 7, mobilité 9, portée 1, sans effet). Carte générique, sans archétype : Flèche divine ne le cible pas. Il s'ajoute aux 25 cartes : le deck Archers en a 26, seule exception à la règle des 25 cartes. **Périmé** : le Monstre de test n'est plus dans le deck Archers depuis le 2026-11-08, et les decks font 30 cartes depuis le 2026-11-10.
- **§6 bis — Pièges** : effet activé, une fois par tour/carte, sur une case adjacente (une des 8 cases autour, voir « Adjacent ») jouable et sans unité. Un piège est caché à l'adversaire (ni sur le plateau, ni dans le journal, ni dans ses actions possibles), ne sert qu'une fois et disparaît au début du prochain tour de son poseur, même si ce dernier est mort. Il se déclenche quand un monstre ennemi entre sur sa case : en se déplaçant (même s'il ne fait que passer), poussé par Bourrasque, en avançant après une attaque ou en y étant invoqué. `vol` n'évite pas les pièges : un monstre volant les déclenche comme les autres, en se déplaçant comme en étant poussé. Après un piège à PV, le monstre continue s'il survit ; une destruction rapporte 1 VP au poseur.
- **§4.6 — Chemin** : le joueur peut choisir son chemin case par case. Sans chemin précisé, le moteur prend un des plus courts, celui que l'interface montre au survol avant le clic.
- **§6 bis — Orientation** : un monstre regarde dans le sens de son dernier pas (déplacement ou avancée ; un recul ne la change pas). Tant qu'il n'a pas bougé, il regarde vers le camp adverse : vers le bas pour J1, vers le haut pour J2. « Par derrière » = l'attaquant frappe dans le sens où regarde la cible. Les bonus d'ATK sont triplés aussi ; pas de bonus contre un terrain.
- **§3 — « Zone maison »** (Écurie, Ferme) : simple nom, sans effet de règle.
- **§5 / §6 bis — Camouflage (Farceur)** (anciennement « Invisible ») : le Poseur de piège a repris l'ancien effet du Farceur (piège qui immobilise) ; le Farceur devient passif. Il est invisible pour l'adversaire tant qu'aucun monstre ni terrain adverse n'est dans un rayon de 2 autour de lui (24 cases, diagonales comprises, coupé par les falaises et les cases X) ; la zone d'invocation adverse ne le révèle pas. Invisible, il n'apparaît pas dans la vue adverse ni dans le journal (ses déplacements et son invocation n'y donnent pas de case), et l'adversaire ne peut ni l'attaquer ni le viser par un sort ou un effet. Une carte jouée vers lui (son invocation, y compris par l'Invocateur, ou un sort de son camp sur lui) reste publique, sans sa case (validé) : l'adversaire voit la carte surgir au centre de l'écran puis s'effacer sur place, comme un sort sans cible ; rien ne file vers sa case, pas d'éclair sur lui. De même, l'effet d'un monstre visible sur lui (soin du Chaman) ne montre pas sa case. Le contrôle d'une mana zone qu'il occupe reste public. Il occupe quand même sa case : un déplacement adverse qui y entrerait s'arrête sur la dernière case du chemin où il pouvait s'arrêter, en gardant sa mobilité restante (les pas faits sont dépensés : il peut repartir, 2026-11-10 ; « sans plus de mobilité ce tour » avant) (les pièges déjà traversés restent déclenchés) ; un recul de Bourrasque s'arrête avant lui ; un tir qui le traverse est arrêté (l'attaque est utilisée, sans dégâts). Dans ces cas il se révèle jusqu'à la fin du tour en cours.
- **§6 bis — Farceur (2026-11-06, validé)** : coût 3 mana, et « Sournois +1 » devient « Assassin ×2 » (dégâts doublés en attaquant par derrière, seulement contre un monstre). Plus aucune carte n'a `sournois`, le mot reste au lexique.
- **§5 — `sournois` (ancien effet du Farceur)** : « par derrière » comme pour `assassin` (l'attaquant frappe dans le sens où regarde la cible). Le bonus s'ajoute à l'ATK actuelle (Bénédiction comprise), seulement contre un monstre. Si une carte avait `sournois` et `assassin`, le +1 s'appliquerait avant le ×3.
- **§6 bis — Évolution (Jeune dragon élémentaire)** : effet actif, 2 mana, une fois par tour/carte, mais pas le tour où le Jeune dragon est arrivé sur le plateau. Le joueur choisit un dragon élémentaire de son grimoire : la carte quitte son grimoire sans que ses 7 mana soient payés. Le Jeune dragon est sacrifié (il quitte le plateau sans être détruit : pas de VP ; il va au cimetière) et le dragon apparaît sur sa case, dans le même sens ; il ne peut ni bouger, ni attaquer, ni activer son effet ce tour-là. Ses statuts ne passent pas au dragon.
- **§6 bis — Zones des dragons** : « les 3 cases de devant » (Déflagration) = la case devant le dragon (dans le sens où il regarde) et ses deux voisines de côté (en diagonale du dragon) ; seules comptent les cases adjacentes au sens ci-dessous (falaises et cases X). « 3 cases en ligne, direction au choix » (Raz de marée, Vent violent) = le joueur choisit une des 4 directions, proposée seulement si un ennemi s'y trouve ; la zone est faite des 3 cases en ligne droite depuis le dragon, et s'arrête avant la première falaise ou case X ; les monstres ne l'arrêtent pas. Le dragon se tourne vers la direction choisie. « Adjacents, rayon 2 » (Tremblement de terre) = les cases adjacentes au dragon et les cases adjacentes à celles-ci : le carré 5 × 5 sur terrain dégagé, coupé par les falaises et les cases X comme « adjacent ». Seuls les monstres ennemis sont touchés (jamais un terrain, jamais un allié, jamais un monstre invisible pour le lanceur). L'effet n'est jouable que si au moins un ennemi est dans la zone.
- **§6 bis — Effets des dragons** : burn 1 (Déflagration) et stun (Raz de marée) durent 1 tour de la cible (§5.5). Vent violent : le joueur choisit la direction puis la distance (1, 2 ou 3) ; chaque ennemi de la ligne recule dans cette direction (le sens où regarde désormais le dragon), en s'arrêtant avant le premier obstacle, comme avec Bourrasque (pièges déclenchés compris). Le plus éloigné du dragon recule en premier, pour ne pas bloquer les autres.
- **§10 — « Adjacent »** : les 8 cases autour d'un monstre, diagonales comprises (soin du Chaman, pose des pièges, Tremblement de terre, zone de devant des dragons). Une case X ou hors plateau n'est jamais adjacente. Une falaise sépare : une case orthogonale derrière une falaise n'est pas adjacente ; une case en diagonale l'est si au moins un des deux chemins en L qui y mènent passe (case de coin jouable, aucune falaise sur le chemin). Les attaques, la riposte, l'avancée, `trophee` et `pillage` restent « au contact » : en ligne droite, à 1 case.
- **§7 — Menace adverse au survol** : hachures orange sur les cases où le monstre adverse pourra aller à son prochain tour ; hachures rouges sur les autres cases qu'il pourra frapper depuis sa case ou l'une d'elles (portée et ligne de vue de son attaque), y compris celles de tes monstres.
- **§5.5 — Durée des statuts** : elle est propre à chaque effet et se compte en tours du camp de l'unité touchée (le tour en cours ne compte pas) : « pendant N tours ». Le filet du Poseur de piège garde sa durée courte, « jusqu'à son prochain tour ».
- **§7 — Vue isométrique et rivière (handoff V5)** : la vue isométrique n'existe que pour les Champs de bataille (11 × 11 et 13 × 13), les plateaux des maquettes ; sur le plateau classique, seules les vues Dessus et Inclinée sont proposées. Sur le Champ de bataille, 4 cases X — (4, 6), (6, 4), (5, 0), (5, 10) — sont dessinées en rivière dans toutes les vues : c'est un rendu seulement, elles restent des cases bloquées.
- **§6 ter — Passage (Terrain drainant, Terrain piégé)** : la zone est formée des 8 cases adjacentes au terrain (voir « Adjacent ») ; « les 2 cases adjacentes » du Terrain piégé désignent ces mêmes 8 cases. L'effet touche le monstre ennemi qui entre sur une case de la zone, en se déplaçant, poussé, en avançant après une attaque ou invoqué (volant et invisible compris ; téléporté compris, §5.4), après les pièges de cette case. En marchant, il se déclenche **à chaque case** de la zone où le monstre entre (deux cases = deux fois ; les statuts se cumulent) ; poussé (Bourrasque), une fois par recul, comme avant ; invoqué ou en avançant, sur sa case d'arrivée. Une destruction rapporte 1 VP au propriétaire du terrain.
- **§6 ter — Terrain piégé** : le monstre qui entre est slow 1 jusqu'à son prochain tour ; il perd aussitôt 1 de mobilité restante, pour ce tour seulement. Les déplacements proposés en tiennent compte : en marchant, chaque case de sa zone où il entre lui coûte 1 mobilité de plus (validé : à chaque case, comme tout Passage ; les slow se cumulent). Pris pendant le tour adverse (recul), le slow ne retire rien.
- **§6 ter — Invocateur** : effet actif, 1 mana, plus le coût du monstre invoqué ; n'importe quel monstre de son grimoire, sur une case adjacente libre (sans unité). Comme une invocation normale, le monstre peut agir aussitôt ; il entre sur sa case (pièges, Passage).
- **§6 ter — Téléporteur** : un allié n'importe où sur le plateau, sauf le Téléporteur lui-même, même immobilisé ou stun ; il est posé sur une case adjacente libre du Téléporteur. Il garde sa mobilité restante, son attaque et son orientation ; il entre sur la case d'arrivée : ce qui s'y trouve se déclenche (§5.4, §10).
- **§6 ter — Terrain de chasse** (validé) : carte commune, dans les decks Archers et Vampire seulement (1 exemplaire, à la place du Terrain drainant). Sa zone : sa case et les 8 cases adjacentes (falaises et cases `X` coupent comme pour « adjacent »). Un de ses monstres qui commence un déplacement sur une case de la zone a +1 mobilité ce tour (bonus du tour, comme Charge), même si ce déplacement reste dans la zone ; un allié arrivé dans la zone en cours de tour (marche, téléportation, Invocateur) en profite en repartant, même à 0 mobilité restante. Une fois par tour pour chaque monstre, tous Terrains de chasse confondus : revenir dans une zone ne redonne rien. Actif dès la pose, pour tous, le monstre sous lequel on le pose compris. Rien pour un monstre stun, immobilisé ou dont le déplacement est fini pour le tour (Retour, sablier, arrêt forcé). Le +1 s'ajoute au plateau, à Charge et aux auras, les slow déjà déduits. Il reste si le terrain est détruit ensuite ; Emma le garde en se transformant (et ne le reprend pas sous l'autre forme) ; un monstre camouflé en profite (le journal ne le dit pas à l'adversaire). La menace affichée au survol et celle que calcule l'IA comptent le +1 d'un monstre qui est dans la zone d'un de ses Terrains de chasse. **Remplacé le 2026-11-10** : terrain de l'archétype Vampire, pour ses vampires seulement, ×3 dans le deck Vampire (voir plus bas).
- **§6 ter — Zone d'invocation** : terrain de coût 1 (le « coût d'activation » est le coût de la carte). Sa case devient une case d'invocation de son camp ; on y invoque si aucun monstre ne s'y trouve, le monstre partageant la case avec son terrain.
- **§6 bis — Cartes communes** : Invocateur, Téléporteur, Terrain drainant, Terrain piégé et Zone d'invocation complètent les decks ; leurs quantités varient d'un deck à l'autre (0 à 3), comme celles du complément, selon la composition du deck (25 cartes). **Le 2026-11-10** : les decks font 30 cartes, et 11 sorts génériques rejoignent les cartes communes (voir plus bas).
- **§6 bis — Flèche divine** (deck Archers) : sort à 2 mana sur un de ses archers, c'est-à-dire un monstre de l'archétype Archer : Archer léger, Archer lourd, Archer de glace, Archer du feu (ni le Trébuchet, ni l'Archer du grimoire de test, ni un archer adverse). +1 ATK et +1 portée jusqu'à la fin du tour : une portée 2 devient 3, avec les règles de tir habituelles. Comme tout sort, sans limite par tour : un second exemplaire se lance s'il reste du mana (les bonus s'ajoutent).
- **§6 bis — Deck Bodybuilder** : « Bodybuilder » est un archétype (§5.1), pas une partie du nom de la carte.
- **§6 bis — Jean Bon, Dopage** : effet actif sur lui-même : +2 ATK pour ce tour, et Jean Bon est burn 1 pendant ses 2 prochains tours.
- **§6 bis — Ki né** : au début de chacun des tours de son camp, après les revenus et avant les statuts, chaque bodybuilder allié dans un rayon de 2 (« adjacents, rayon 2 », §5.3 ; pas Ki né lui-même) récupère 1 PV, sans dépasser ses PV max (soin, validé 2026-11-06).
- **§6 bis — Arnold** : son aura donne +1 ATK aux bodybuilders alliés dans un rayon de 2 (« adjacents, rayon 2 », §5.3 : carré 5 × 5 sur terrain dégagé, falaises et cases X coupent la zone ; pas à lui-même) tant qu'ils le restent : à l'attaque, à la riposte et dans les dégâts affichés. Deux Arnold se cumulent (+2), et deux Arnold à portée l'un de l'autre se donnent +1 chacun. Avant le 2026-11-06 : +2 ATK aux bodybuilders adjacents.
- **§6 bis — Salle de sport (2026-11-06, validé)** : terrain à 2 mana, 4 PV, du deck Bodybuilder (×1, à la place de la Boule de feu). Son aura donne +1 ATK et +1 PV à ses bodybuilders alliés sur sa case et les 8 cases autour (« sa case et adjacents », `cellAndAdjacent`, §5.3 : un bodybuilder posé sur le terrain en profite). C'est une aura comme celle d'Arnold et d'Origine : le bonus dure tant que le monstre est dans la zone ; PV et PV max se gagnent en entrant et se perdent en sortant (ou si le terrain est détruit), sans descendre sous 1 PV. Plusieurs sources se cumulent (Arnold, Salle de sport). Un terrain se pose comme les autres (§4.9).
- **§6 bis — Rudy (2026-11-06, validé)** : son aura donne +1 mobilité aux bodybuilders alliés dans un rayon de 2 (pas à lui-même), comptée au début du tour du monstre comme celle d'Origine (§10) : un monstre qui entre dans la zone en cours de tour ne l'a qu'au tour suivant. Plusieurs Rudy se cumulent.
- **§6 bis — Tibo, Tortank (2026-11-06, validé)** : effet actif, 1 mana, sur lui-même : statut `carapace` jusqu'à son prochain tour (`turns: 0`, §5.5). La prochaine attaque que Tibo subit, ou la riposte d'un monstre qu'il attaque, ne lui inflige que 1 PV (même dans le dos), puis la carapace disparaît. Les sorts, effets, pièges, Passage, Zone et burn ne sont pas des attaques : ils infligent leurs dégâts normaux et ne consomment pas la carapace. Requiem n'est pas un dégât. L'aperçu de la bulle annonce déjà 1 dégât. Nom « Carapace » validé. **Remplacé le 2026-11-10** : la carapace ne laisse plus passer que 1 PV d'une attaque ; elle empêche les PV de descendre sous 1, quels que soient les dégâts (voir plus bas).
- **§6 bis — Rayon 2 pour les auras (2026-11-06)** : « dans les 2 cases adjacentes » s'entend comme « adjacents, rayon 2 » (`adjacent2`, §5.3). Les auras et le soin de début de tour peuvent donc viser ce rayon (`AllyZone`). Les bodybuilders sont toujours ceux du camp de la source.
- **§6 bis — Jeune Gomuscu** : +1 ATK et +1 PV (PV max compris), définitivement, chaque fois que son attaque détruit un monstre ou un terrain, avant une éventuelle avancée.
- **§6 bis — Seringue** : 2 mana, sur un de ses bodybuilders. Son ATK double pour ce tour seulement (l'ATK du moment, bonus du tour compris ; une aura d'Arnold s'ajoute ensuite sans être doublée). Requiem 2 : piqué pendant son tour, il joue ce tour et son prochain tour, puis meurt au début du suivant, avec les statuts, après les revenus et les passifs (§4.2 : sa mana zone rapporte encore ce tour-là) ; personne ne gagne de VP.
- **§7 — Sons et décor (handoff V5)** : la règle « la Bourrasque déclenche les pièges » du handoff était déjà en place ; on garde les réponses validées plus haut là où le handoff dit autre chose (un monstre `vol` déclenche les pièges ; un monstre qui survit à une bombe continue son chemin).
- **§6 bis — Archétypes Dragons et Pièges** : les dragons élémentaires sont le Jeune dragon élémentaire, les 4 dragons élémentaires et Origine ; les monstres piège, les 4 monstres du deck Pièges (Poseur de piège, Farceur, Poseur de bombe, Clown assassin). « Piège » est aussi le nom de l'archétype ; « monstre piège » ne désigne que ces monstres, pas les pièges posés.
- **§6 bis — Origine - Dragons** (anciennement « Dragon élémentaire - Origine ») : 10 mana, Vol, pas d'effet actif ni d'évolution (aucun Jeune dragon n'évolue en elle). Son aura donne +1 ATK, +1 PV et +1 mobilité aux dragons élémentaires alliés adjacents (Jeune dragon compris, pas elle-même), cumulable avec une autre Origine. ATK : comme l'aura d'Arnold. PV : en entrant dans l'aura, +1 PV et +1 PV max ; en la quittant (lui ou Origine s'éloigne, Origine disparaît), il perd ce PV et ce PV max, sans descendre sous 1 PV ; compté après chaque action. Mobilité : +1 au début de son tour s'il est adjacent à Origine à ce moment-là (pas en cours de tour).
- **§6 bis — Pénombre** (deck Pièges, ×2) : sort à 5 mana, sans cible à choisir : tous ses monstres piège sur le plateau deviennent invisibles comme le Farceur (camouflage 2 : vus dès qu'un monstre ou un terrain adverse est dans un rayon de 2, révélés s'ils bloquent une action adverse) jusqu'à la fin de son prochain tour (« pendant 1 tour »). Ceux qui arrivent ensuite n'en profitent pas. Jouable s'il a au moins un monstre piège.
- **§6 bis — Deck Sorciers du feu** : archétype Sorciers du feu (Feria, Lutin brasier, Archimage, Golem de lave). « Si un monstre est touché par une attaque, il est burn pendant 2 tours » = le mot-clé Brûlure 1, 2 tours : burn 1 pendant 2 tours de la cible, terrains compris, comme la Brûlure de l'Archer du feu. « Burn x2 » (Archimage) = burn 2.
- **§6 bis — Lutin brasier** : effet actif, 1 mana : une case libre (sans unité, pas déjà brûlée) parmi ses « adjacents, rayon 2 » brûle jusqu'à la fin du 2e prochain tour de son camp (« pendant 2 tours » : deux tours adverses). Chaque monstre ennemi qui y entre (en passant, poussé, en avançant, invoqué ou téléporté, volant et invisible compris) perd 1 PV puis est burn 1 pendant 1 tour ; la case reste. Elle est visible des deux joueurs. Un monstre déjà sur la case quand elle s'éteint ou qui y reste n'est pas touché à nouveau ; seule l'entrée compte.
- **§6 bis — Archimage** : effet actif, 2 mana : tous les ennemis adjacents (zone « adjacents ») sont burn 2 pendant 2 tours.
- **§6 bis — Golem de lave** (« Zone », validé) : « Une zone enflammée entoure le monstre : tout ennemi dedans est burn 1 pendant 1 tour. » La zone, ce sont les 8 cases autour du Golem, qui la suit. Un ennemi (monstre) y est burn dans trois cas : (1) il y entre, à chaque case en marchant, une fois par recul, comme avec un Passage ; (2) c'est le Golem qui arrive à côté de lui en se déplaçant, en reculant, en avançant après une attaque ou en étant invoqué ou téléporté : une fois par ennemi et par mouvement, et seulement si l'ennemi n'était pas déjà dans la zone à la case d'avant (un ennemi qui reste à côté pendant que le Golem longe sa case n'est pas touché de nouveau) ; (3) **au début du tour du possesseur du Golem**, chaque ennemi encore dans la zone est de nouveau burn 1 pendant 1 tour (après les revenus et les passifs de début de tour, avant les statuts, §4.2). Les burn se cumulent. « Zone » est un mot du lexique distinct de « Passage » (Terrain drainant, Terrain piégé, Fissure temporelle gardent Passage).
- **§3 — Plus de bonus de mobilité du plateau (validé)** : le 15 × 15 est la carte de référence ; `Board.mobilityBonus` n'existe plus. La mobilité d'un monstre est celle de sa carte (plus les auras, Charge, Terrain de chasse et les slow), à l'invocation et à chaque début de tour, sur tous les plateaux : les cartes ont déjà compté le +1 dans leur mobilité. Les cartes des autres decks gardent pour l'instant leur mobilité d'avant (sans le +1) ; elles sont ajustées dans le doc « Cartes du TCG ».
- **§6 bis — Deck Sorciers du feu, refonte des stats (validé)** : Apprenti devient **Feria** (« Feria - Sorciers du feu », rôle Tireur - Mage ; même carte, même illustration) : 2 mana, ATK 1, PV 3, mobilité 6, portée 2. **Lutin brasier** (Contrôleur) : 1 mana, ATK 1, PV 4, mobilité 5, portée 1 ; son effet actif (case brûlée) ne change pas. **Archimage** (Mage - tank) : 6 mana, ATK 3, PV 8, mobilité 4, portée 2 ; effet actif à **2 mana** (au lieu de 1) ; son passif est la Brûlure 1, 2 tours. **Golem de lave** (Tank) : 5 mana, ATK 2, PV 12, mobilité 2, portée 1 ; sa Zone (burn 1 pendant 1 tour) ne change pas. Les rôles (Tireur, Contrôleur, Mage, Tank) ne sont pas dans le moteur.
- **§3 — Grande carte 13 × 13 (handoff V7)** : elle s'ajoute aux deux autres et devient la carte proposée par défaut dans « Nouvelle partie ». Le bonus de +1 mobilité de cette carte a été retiré (voir « Plus de bonus de mobilité du plateau »). Ses 4 cases d'eau — (2, 6), (3, 6), (9, 6), (10, 6) — sont des cases X ; deux cases d'eau voisines verticalement sont dessinées en un seul étang.
- **§3 — Grande carte 13 × 13, retouche** : l'Écurie recule d'une case vers la base de J1, en (4, 1), et la Ferme vers celle de J2, en (8, 11) ; un passage s'ouvre dans chaque mur de rochers, en (5, 3) et en (7, 9).
- **§3 — Grande carte 13 × 13, murs intérieurs de la Mine** : décalés d'un cran pour se trouver devant ses deux ouvertures, en (9, 1)|(10, 1) sous l'entrée du haut et en (11, 2)|(11, 3) devant celle de droite. La Mine passe à 13 cases de marche pour chaque joueur.
- **§3 — Grande carte 13 × 13, Scierie** : mêmes falaises que la Mine, par symétrie (murs intérieurs devant ses deux ouvertures compris), mais basses : les tirs de portée 2+ et `vol` passent toujours. La Scierie passe à 13 cases de marche pour chaque joueur.
- **§3 — Grande carte 15 × 15 (handoff plateau 15, validé)** : elle s'ajoute aux trois autres, sous le nom « Champ de bataille (15 × 15) ». Pas de bonus de mobilité (retiré, voir « Plus de bonus de mobilité du plateau »). L'Écurie est sur la diagonale de la base de J1, en (2, 2), et la Ferme en miroir, en (12, 12), au lieu de (5, 1) et (9, 13) dans la maquette (d'abord essayées en (3, 3) et (11, 11) : la forge peinte cachait l'Écurie en vue isométrique). Les étangs sont des cases X basses : les tirs de portée 2+ passent. La crête claire côté Scierie, (9, 4), (9, 5), (10, 5), reste en cases X ordinaires : la Scierie n'est ouverte aux tirs que par le canal.
- **§10 — Cases X hautes et basses (15 × 15)** : une case X peut être **haute** ou **basse**, en plus de la case X ordinaire. **Haute** (parois et tas de minerai de la Mine, cases de la crête qui la ferment) : même règle que les falaises de la Mine ; rien ne la traverse, même `vol` ; elle coupe la ligne de vue de toutes les attaques et de l'effet du Mage. **Basse** (canal et billots de la Scierie, étangs) : même règle que les falaises de la Scierie ; on ne s'y arrête pas et on ne la traverse pas à pied ; `vol` la survole ; les tirs de portée 2 ou plus passent par-dessus, un monstre de portée 1 ne frappe pas à travers. Adjacence, rayon et recul : une case X reste une case X, quelle que soit sa hauteur.
- **§7 — Angle du plateau (validé)** : le même pour les deux joueurs, sur toutes les cartes : J1 commence en haut du plateau, J2 en bas. Le plateau ne tourne plus vers le joueur qui joue (le réglage est retiré).
- **§5.1 — Noms « Nom - Archétype »** : les cartes propres à un deck s'appellent « Nom - Archétype », l'archétype étant le nom du deck (« Feria - Sorciers du feu », « Apprenti - Explorateur du temps »). Les cartes de base et communes gardent leur nom seul. À l'écran, la tuile du grimoire et la fiche écrivent le nom en gros et l'archétype en petit dessous ; le journal et la bulle d'action écrivent le nom complet.
- **§4.8 — Plusieurs effets actifs** : un monstre peut avoir deux effets actifs (Chronomancienne, Dragonnet, Maître du temps) ; il peut utiliser chacun une fois par tour/carte, dans n'importe quel ordre, s'il a le mana.
- **§6 bis — Retour (Explorateur du temps)** : effet actif, 1 mana : le monstre se téléporte sur une case libre où il a été ce tour (son chemin du tour), sa case de départ comprise (ou sa case d'invocation s'il est arrivé ce tour). Comme toute téléportation, il entre sur la case : piège, Passage, case brûlée et Zone s'y déclenchent. Il garde son orientation, et son attaque reste utilisable une fois par tour (avant ou après le retour) ; il garde sa mobilité restante et peut encore se déplacer (**changé le 2026-11-10** : avant, il ne pouvait plus se déplacer). Le chemin s'arrête à la case retrouvée. Texte de la carte : « Se téléporte sur une case libre où il a été ce tour. Ne peut plus se déplacer après l'activation de cet effet. »
- **§6 bis — Sablier de la Chronomancienne** : effet actif, 1 mana (2 avant la revue des stats du 2026-11-06) : un piège sur une case adjacente libre, qui dure comme les autres (jusqu'au prochain tour du poseur). Le monstre ennemi qui y entre « remonte 3 cases » : il revient de 3 cases en arrière sur son chemin du tour (à son départ si le chemin est plus court), en téléportation (ce qui est sur la case d'arrivée se déclenche) ; une case occupée entre-temps est sautée, vers le piège. Son déplacement s'arrête là, sans plus de mobilité ce tour. Poussé sur le piège (Bourrasque), il remonte de même sur son chemin, déplacements de son dernier tour compris.
- **§6 bis — Dragonnet - Explorateur du temps** : effet actif, 2 mana : un ennemi adjacent est stun pendant 1 tour (il perd tout son prochain tour, comme le Raz de marée).
- **§6 bis — Maître du temps** (anciennement Hermite, renommé avec son illustration du handoff overframe V2) : 6 mana, 5 ATK, 5 PV, mobilité 7 (stats revues, validé ; avant : 7 mana, 6 PV, mobilité 4). Effet actif, 2 mana : un ennemi adjacent reçoit requiem : il joue encore son prochain tour, puis meurt au début du suivant ; personne ne gagne de VP.
- **§6 bis — Piège temporel** : sort à 3 mana, sans cible à choisir : tous les monstres ennemis que voit le lanceur sont immobilisés pendant 1 tour (tout leur prochain tour). Jouable s'il y en a au moins un.
- **§6 bis — Fissure temporelle** : terrain à 3 mana, 4 PV : Passage · adjacents (les 8 cases autour) · immobilisé jusqu'à son prochain tour : un ennemi qui entre dans la zone en se déplaçant s'arrête pour le reste de ce tour.
- **§6 bis — Deck Explorateur du temps** : composition proposée, à ajuster dans le doc « Cartes du TCG ».
- **§7 — Exemplaires brillants (handoff V11)** : purement visuels, sans effet sur les règles. Un exemplaire de carte peut être brillant (« shiny ») ; une carte jouée l'est d'abord dans un exemplaire brillant s'il en reste, et l'unité qu'elle fait venir (monstre, terrain, évolution, Invocateur) est brillante. L'adversaire ne voit pas les exemplaires brillants de votre grimoire, mais voit une unité brillante. Démo (validée) : un Archer de glace et un Archer du feu brillants dans le deck Archers, une Feria dans Sorciers du feu, un Zoldik dans Vampire (« Sang bleu » : ses rouges passent au bleu). Les overframes (Chronomancienne, Maître du temps…) ne sont pas brillantes pour autant.
- **§4.3 / §7 — Cartes jouées et cimetière (validé)** : les deux joueurs consultent, pour chaque camp, ses cartes jouées et son cimetière, publics. **Carte jouée** : toute carte sortie du grimoire, monstre invoqué (y compris par l'Invocateur), sort lancé, terrain posé, dragon d'une évolution ; ni la transformation d'Emma (la chauve-souris n'est pas une carte), ni un piège (effet d'un monstre). Le Jeune dragon sacrifié reste une carte jouée, et va au cimetière. Un monstre camouflé y figure par sa carte, comme dans le journal (« J2 invoque Farceur, invisible. »), sans rien dire de sa case. Le deck adverse étant connu, on peut en déduire son grimoire (c'était déjà possible en lisant le journal). **Exemplaire brillant** : brillant dans les deux listes s'il l'est sur le plateau, comme son unité (monstre ou terrain ; un sort, jamais, comme dans son cut-in) ; l'adversaire ne le voit pas brillant tant que l'unité lui est cachée ; rien ne trahit les exemplaires restés au grimoire. **Écran** : dans la barre du haut, à côté des VP de chaque joueur, deux compteurs, cartes jouées et cimetière ; un clic ouvre un panneau flottant en haut du plateau, comme l'aide, sur ce joueur et cette liste (des onglets passent à l'autre liste), fermé par sa croix, Échap ou le même compteur. Une tuile par exemplaire, sans regroupement, dans l'ordre de jeu, la plus récente en premier (au cimetière, dans l'ordre d'arrivée). Survol ou clic d'une tuile : sa fiche, la carte seule (coût, stats, effets), sans ligne de jeu ni d'état. La ligne « Cimetière adverse » du journal disparaît.
- **§4.10 — Mana sans plafond, orbe de mana (handoff V11)** : le mana reste sans plafond ; l'orbe du score est pleine à 10 mana (au-delà, seul le chiffre monte).
- **§4.4 bis — Mode contestation (validé)** : nouveau mode, « Contestation », à côté du mode « Normal » (pas « Classique », déjà le nom d'un deck et du plateau 11 × 9). Proposé sur le 13 × 13 et le 15 × 15 seulement. Zone de 9 cases : le carré 3 × 3 centré sur la mana zone, ses cases X comprises (personne ne s'y tient ; Mine et Scierie du 15 × 15 : 7 cases utiles). Contrôle par présence : la zone est au seul joueur qui y a des unités (monstres ou terrains), un terrain seul suffit, personne : neutre. Un terrain la tient pour son propriétaire tant qu'il n'est pas détruit, même si l'adversaire y a des monstres et même si son propriétaire y a aussi les siens ; une zone n'est donc contestée que sans terrain, quand les deux joueurs y ont des monstres. Zone contestée : ni mana ni VP pour personne, et pas de terrain posé. Une zone tenue rapporte comme en mode Normal (+1 mana bonus compris, +1 VP), évalué au début du tour (§4.2). Terrain : seulement sur la mana zone (case centrale), sous un de ses monstres, un par zone (§4.9), si la zone n'est pas contestée. Étendard : le Porte-étendard donne son bonus sur n'importe quelle case de la zone, si son camp la tient. Un monstre camouflé dans la zone compte : l'état de la zone (tenue, neutre, contestée) reste public, comme le contrôle d'une mana zone en mode Normal.
- **Puces « Statuts » / « Effets »** (dans l'infobulle du jeton depuis le 2026-11-11, plus sur la fiche : voir « Fiche plein cadre et état au jeton ») : chaque puce ne montre que le nom du lexique (Stun, Immobilisé, Slow N, Burn N, Requiem, Camouflé ; pour un bonus du tour, le nom de sa source : l'effet s'il en a un, « Dopage », sinon la carte, « Charge », « Seringue », « Flèche divine » ; Aura, nom du plateau, Camouflé/Repéré, nom de la mana zone, nom du terrain) ; dans l'infobulle, un statut porte les tours qu'il lui reste (« Burn 1 · 2 tours ») et un effet en cours sa phrase (valeur, durée, source). Chaque bonus du tour garde sa source (pas les statuts : un statut n'affiche que sa valeur et sa durée) ; deux exemplaires d'un même sort font une seule puce, bonus cumulés. Les statuts et les autres effets sont dans deux groupes séparés. Le sens du monstre n'est pas dans la fiche.
- **§6 bis — Deck Vampire (validé)** : archétype Vampire (Delta, Emma et sa forme chauve-souris, Vladimir, Zoldik) ; cartes « Nom - Vampire » ; dans un texte, « un allié vampire », « tes vampires ». Mots retenus : « Soif N » pour « récupère 1 PV lorsqu'il attaque » ; « absorbe » pour « vole » des PV (« Vol » est déjà un mot-clé, « drainant » est pris par le Terrain drainant) ; « se transforme » pour la transformation, et pour rien d'autre ; le texte de Sacrifice sanguinaire ne dit pas « sacrifie » (sacrifier = quitter le plateau), le nom de la carte reste. Composition proposée, à ajuster dans le doc « Cartes du TCG ».
- **§5.6 — Soif (Vampire)** : à l'attaque, le vampire récupère N PV (soin sur lui-même, sans dépasser ses PV max ; rien s'il a tous ses PV). Après les dégâts, avant la riposte et l'avancée : Delta à 1 PV qui attaque le Gardien remonte à 2 PV, puis retombe à 1 après la riposte, et survit. Aussi quand la cible est détruite. Contre un terrain : rien (« aussi contre un terrain » avant le 2026-11-10). Une riposte n'est pas une attaque : elle ne déclenche pas Soif. Un tir arrêté par un monstre camouflé ne soigne pas.
- **§6 bis — Vladimir** : effet actif, 2 mana : chaque ennemi adjacent (zone « adjacents » : jamais un allié, jamais un monstre invisible pour lui) perd 1 PV, et Vladimir récupère 1 PV par ennemi touché, sans dépasser ses PV max. Jouable dès qu'un ennemi est adjacent, même s'il a tous ses PV. Un ennemi détruit rapporte 1 VP au joueur de Vladimir. Pas de riposte : ce n'est pas une attaque.
- **§6 bis — Zoldik** : effet actif, 3 mana : un ennemi adjacent (les 8 cases autour) tombe à 1 PV, et Zoldik récupère les PV retirés, sans dépasser ses PV max. Impossible sur un ennemi à 1 PV ; jouable même si Zoldik a tous ses PV. La cible reste à 1 PV : jamais de destruction, jamais de VP. Il peut attaquer puis activer l'effet ; après l'activation, il ne peut plus attaquer ce tour.
- **§6 bis — Appel du sang** : sort, 3 mana, sans cible à choisir : tous ses vampires sur le plateau (jamais ceux de l'adversaire) ont +2 mobilité ce tour ; ceux qui arrivent ensuite n'en profitent pas. Jouable s'il a au moins un vampire. La chauve-souris d'Emma est un vampire.
- **§6 bis — Sacrifice sanguinaire** : sort, 2 mana, sur un de ses vampires : il tombe à 1 PV (PV perdus = ses PV actuels − 1), puis gagne +1 ATK par PV perdu jusqu'à la fin du tour. « La cible perd son attaque le tour suivant » = le bonus d'ATK ne vaut que ce tour ; « ne regagne pas ses PV » = rien ne les lui rend, mais il peut être soigné ensuite (Soif, Chaman, absorbe). Impossible sur un vampire à 1 PV. La perte de PV ne détruit pas et ne rapporte rien.
- **§6 bis — Emma, transformation** : effet actif, 1 mana, sans limite par tour (exception à « une fois par tour/carte », §4.8) : Emma se transforme en chauve-souris (Emma chauve-souris - Vampire : ATK 1, PV 1, mobilité 8, portée 1, Soif 1, sans Vol), et la chauve-souris redevient Emma par le même effet. C'est le même monstre : case, orientation, statuts, bonus du tour et bonus définitifs (Bénédiction vaut pour les deux formes), attaque déjà utilisée (une seule attaque par tour, quelle que soit la forme) et chemin du tour restent. Ce n'est ni une entrée sur la case ni une invocation : rien ne s'y déclenche. **PV mis de côté** : chaque forme garde ses PV perdus ; en se transformant, il met de côté les PV de la forme qu'il quitte et retrouve ceux de la forme qu'il prend (la première fois, la chauve-souris a tous ses PV ; Emma blessée à 1/3 redevient Emma à 1/3). **Mobilité** : mobilité de la nouvelle forme (bonus du plateau, Charge, Appel du sang compris, slow déduits) moins ce qu'il a déjà dépensé ce tour ; Emma qui a marché 5 cases sur le 13 × 13 (5 de mobilité) devient une chauve-souris à 4 cases, et une chauve-souris qui a tout dépensé ne regagne rien en redevenant chauve-souris. Un monstre qui ne peut plus se déplacer ce tour (stun, immobilisé, sablier, retour, arrêt forcé) ne regagne rien en se transformant. La chauve-souris n'est pas une carte du grimoire (ni invocable, ni dans un deck) : détruite, c'est Emma qui va au cimetière, et l'adversaire marque 1 VP. La forme reste d'un tour à l'autre ; au début de son tour, il a la mobilité de sa forme.
- **§4.7 / §10 — Attaque en diagonale (validé le 2026-11-07)** : un monstre de **portée effective 2 ou plus** (portée de la carte + bonus du tour : un monstre de portée 1 qui gagne +1 portée avec Flèche divine y a droit pour le tour) peut attaquer une unité ennemie (monstre ou terrain) sur une des 4 cases **en diagonale, à 1 case**, en plus de sa ligne droite. La diagonale ne s'étend pas (jamais à 2 cases, quelle que soit la portée). La case doit être **adjacente** au sens du §10 (jouable, avec au moins un chemin en L sans falaise ni case X) ; les monstres et terrains du coin ne gênent pas le tir. Ce n'est **pas un contact** : ni riposte du défenseur, ni avancée, ni Trophée, ni Pillage, ni bonus de dos (Assassin, Sournois) ; les autres mots-clés de l'attaque (Brûlure, Givre, Soif, Prime, Siège) s'appliquent. Seules les **attaques** changent : les effets « un ennemi en ligne, portée N » (Mage) restent en ligne droite. La menace adverse au survol (hachures rouges) et l'IA comptent les diagonales. À rééquilibrer au besoin avec les stats des monstres de portée 2+ (Archers, Mage, Feria, Archimage, Trébuchet…).
- **§4.2 — Mana : plus de cumul, +1 par tour, mana de zone par terrain (validé le 2026-11-07)** : au début de son tour, un joueur **perd le mana qu'il n'a pas dépensé**, puis reçoit son **mana de base** : 3 à son premier tour, +1 à chacun de ses tours suivants (3, 3, 4, 4, 5, 5… : J1 T1 3, J2 T1 3, J1 T2 4, J2 T2 4…), **sans plafond** ; le mana gagné pendant le tour (Pillage, effets) se dépense dans le tour ou se perd de même. Le premier tour est celui du joueur désigné par le lancer de dés (§4.1), son adversaire a aussi 3 à son premier tour. Une mana zone tenue rapporte toujours **1 VP**, mais **le mana de la zone (+1) n'est généré que si le joueur y a un terrain** (Autel de mana : +2 en tout) ; un monstre seul dans une zone n'en génère pas. L'**Étendard** n'ajoute son +N que dans une zone où son camp a un terrain (Étendard + Autel : 3). Le contrôle des zones, la contestation et les VP ne changent pas. L'IA ne compte plus son mana en réserve une fois son tour fini.
- **§4.4 bis — Contestation : supériorité numérique (validé le 2026-11-07)** : en mode contestation, la zone de 9 cases est tenue par le joueur qui y a **le plus d'unités**, monstres (camouflés compris) et terrain, 1 chacun. 1 contre 1 : contestée (ni mana ni VP pour personne) ; 2 contre 1 : le plus nombreux la garde ; une zone sans unité est neutre. **Le terrain ne tient plus la zone tout seul** quand l'adversaire a des unités : il compte 1 ; il la tient seul s'il n'y a aucune unité adverse. Le terrain se pose seulement dans une zone qu'on tient (pas contestée, pas tenue par le nombre de l'adversaire). Le mana de zone (+1, §4.2) va au joueur qui tient la zone et y a un terrain ; si l'adversaire tient la zone par le nombre, le terrain ne rapporte rien à son propriétaire. Le mode Normal ne change pas (une case). L'IA protège ses zones par le nombre : un terrain seul n'est plus une zone sûre, elle compte les ennemis qui peuvent arriver.
- **§6 bis — Deck Sorciers du feu, refonte du 2026-11-07 (validé)** : remplace la « refonte des stats » du 2026-11-06. **Feria** : 3 mana, ATK 1, PV 3, mobilité 5, portée 2, Brûlure 1, 2 tours. **Lutin brasier** : 2 mana, ATK 1, PV 3, mobilité 6, portée 1, **plus de Brûlure** ; son effet est un actif à 1 mana (le texte de l'utilisateur disait « passif ») : une case libre dans un rayon de 2 brûle **3 tours** (au lieu de 2, en tours du camp du lanceur), le reste inchangé (1 dégât + burn 1 pendant 1 tour pour chaque ennemi qui y entre, visible des deux joueurs, la case reste). **Archimage** : 6 mana, ATK 3, PV 7, mobilité 5, portée 2, Brûlure 1, 2 tours ; actif à **1 mana** (au lieu de 2) : burn 2 pendant 2 tours à tous les ennemis dans un **rayon de 2** (« carré de 2 », au lieu d'« adjacents »). **Golem de lave** : 4 mana, ATK 2, PV 10, mobilité 2, portée 1, Zone · adjacents inchangée. « Carré de N » du texte de l'utilisateur = « rayon N » du lexique (pas de mot en plus).
- **§5.3 / §6 bis — Brûlure en chaîne** (sort, 2 mana, validé le 2026-11-07) : « tous les ennemis adjacents à une de tes unités » (`enemiesNearAllies`, zone `adjacent`). Les unités qui servent de centre sont **ses monstres et ses terrains**. Les ennemis touchés sont des monstres visibles de lui (jamais un terrain ni un monstre invisible). Chaque ennemi subit burn 1 pendant 2 tours **une fois par unité alliée à côté de laquelle il se trouve** : à côté de deux de ses unités, il a deux burn 1 (qui se cumulent, §5 bis) ; un monstre et son terrain sur la même case comptent pour deux. Falaises et cases X coupent la zone comme pour « adjacent ». Jouable s'il y a au moins un ennemi touché. Composition : ×2 à la place du Gardien et du Chevalier du deck.
- **§6 bis — Deck Vampire, refonte du 2026-11-07 (validé)** : remplace les stats du 2026-11-06. **Delta** : 3 mana, ATK 3, PV 3, mobilité 4. **Emma** : 1 mana, ATK 2, PV 3, mobilité 3. **Emma chauve-souris** : coût 1 (comme Emma ; affichage et IA seulement, elle n'est pas invocable), ATK 1, PV 1, mobilité 8, Soif 1 gardée, retour en Emma par le même effet (1 mana, sans limite par tour) ; PV perdus gardés par forme (§10). **Vladimir** : 4 mana, ATK 3, PV 5, mobilité 5 ; actif à **1 mana** (au lieu de 2) : absorbe 1 PV à chaque **ennemi** adjacent (jamais un allié), il récupère 1 PV par ennemi touché. **Zoldik** : 6 mana, ATK 3, PV 8, mobilité 5 ; actif à **2 mana** (au lieu de 3) : absorbe tous les PV d'un **ennemi** adjacent sauf 1, **puis plus d'attaque ce tour pour Zoldik** (« ce monstre » du texte de l'utilisateur = Zoldik ; il peut avoir attaqué avant d'activer). « Vole N PV » du texte de l'utilisateur = « absorbe » (« Vol » est un mot-clé), « récupère 1 PV lorsqu'il attaque » = Soif 1. Composition, Appel du sang (3 mana) et Sacrifice sanguinaire (2 mana) inchangés ; à rééquilibrer après test (Sacrifice sanguinaire sur Zoldik 8 PV : +7 ATK).
- **§5.2 — Fiche d'un effet de monstre (validé le 2026-11-08)** : chaque effet de monstre se décrit par Nom, Type (actif ou passif), Condition d'activation, Coût d'activation, Effet, Contre-coup et Limites ; **nom, type et effet sont obligatoires**, le reste peut être nul. Exemple de l'utilisateur : « Miroir de souvenirs · actif · un ennemi visible dans un carré de 1 · 1 mana · la cible est stun pendant 1 tour · contre-coup : « fatigue » au lanceur jusqu'à la fin du prochain tour · 1x/tour ». **« Contre-coup » et le statut « fatigue » ne sont pas encore au lexique ni dans le moteur** : ils ne s'implémentent qu'avec une carte qui les utilise, après les questions d'usage (que fait « fatigue » ?).
- **§5.1 — Carré de N et « adjacent » (validé le 2026-11-08)** : nouveau terme **carré de N** : les cases à N cases au plus autour du sujet, diagonales comprises, sans sa case (carré de 1 = les 8 cases autour, carré de 2 = les cases autour plus celles d'après, 24 sur terrain dégagé) ; falaises et cases X coupent la zone comme avant. Il **remplace « adjacent »** (8 cases) et **« rayon N »** : toutes les cartes qui disaient « adjacent » ou « rayon 2 » disent maintenant « carré de 1 » ou « carré de 2 », **sans changement de règle** (zones `adjacent` → `square1`, `adjacent2` → `square2`, `cellAndAdjacent` → `cellAndSquare`, `emptyAdjacentCell` → `emptySquareCell`). **« Adjacent » ne désigne plus que les 4 cases orthogonales** (haut, bas, gauche, droite ; jouable, sans falaise entre les deux) : aucune carte ne l'emploie encore. Les entrées de cette section écrites avant le 2026-11-08 gardent l'ancien vocabulaire : y lire « adjacent » (8 cases) comme « carré de 1 » et « rayon 2 » / « adjacents, rayon 2 » comme « carré de 2 ». « Au contact » (1 case en ligne droite) et « avancée » ne changent pas.
- **§6 bis — Deck Explorateur du temps, remaniement du 2026-11-08 (validé)** : remplace les stats et effets du 2026-11-06/07. **Apprenti** : 1 mana, ATK **1** (au lieu de 2), PV 2, mobilité 5, portée 1. **Chronomancienne** : 4 mana (inchangé), ATK 3, PV **3**, mobilité **7**, portée 1. **Dragonnet** : stats inchangées (3 mana, 3/3, mobilité 6). **Maître du temps** (**renommé**, ancien « Maître des heures » ; id `maitre-du-temps`) : stats inchangées (6 mana, 5/5, mobilité 7). Chaque effet a maintenant un nom (§5.2). **Retour vers le futur** (les 4 monstres, 1 mana) : le Retour du 2026-11-06 sous un nouveau nom ; sa condition (« s'être déplacé ce tour », « de tour » du texte lu comme « ce tour ») est celle du Retour : il faut une case libre du chemin du tour autre que la sienne, donc s'être déplacé, ou avoir été repoussé ou téléporté, pendant ce tour ; il ne peut plus se déplacer après. **Sablier du temps** (Chronomancienne, 1 mana) : le piège **reste 3 tours adverses** (au lieu d'un : il est encore là au début des deux prochains tours de son poseur et disparaît au début du 3e, ou dès qu'un ennemi le déclenche), et **une Chronomancienne n'a qu'un sablier à la fois** : en poser un nouveau fait disparaître l'ancien (sans VP, il n'a pas servi) ; chaque exemplaire garde le sien ; le sablier reste si sa Chronomancienne est détruite ; il se déclenche sur toute entrée comme avant (§10, Pièges). Nouveau champ de données `Trap.sourceId` et `Trap.expiresAtTurn` ; `placeTrap` porte `turns` et `single`. **Miroir de souvenirs** (Dragonnet) : 1 mana (au lieu de 2), un ennemi dans un carré de 1, stun pendant 1 tour, comme avant ; **contre-coup : silence pendant 1 tour** pour le Dragonnet. **Silence** (nouveau statut, §5 bis, validé) : « ne peut pas activer ses effets » = plus aucun effet **actif** (Retour compris), tout de suite, jusqu'à la fin de son prochain tour (« pendant 1 tour », §5.5) ; attaque, déplacement, mots-clés et passifs inchangés. Le Dragonnet peut donc utiliser Retour **avant** le Miroir, pas après. Le contre-coup est appliqué après l'effet, même si la cible est déjà stun ou détruite ; il ne peut pas être évité. **Requiem** (Maître du temps, 2 mana) : un **ennemi** dans un carré de 1 (« un monstre » du texte lu comme « un ennemi », validé), **requiem** comme avant. « Visible » est omis du texte : un ennemi qu'on peut viser est toujours visible. « Marche dedans » du sablier s'entend comme « entre » (toutes les entrées, comme avant). « Inflige un statut » s'écrit « est stun / s'inflige silence » (« inflige » reste pour les dégâts). Composition inchangée. Pas modélisé par l'IA : silence et contre-coup.
- **§6 bis — Deck Archers impériaux (2026-11-08, validé)** : il remplace entièrement l'ancien deck Archers (l'archétype `archer` s'affiche « Archers impériaux » ; le Trébuchet des archers en fait partie, contrairement à l'ancien Trébuchet générique). Rôle (Rusher, Tireur) : information de fiche seulement. **Écuyer des archers** : ATK 0, portée 0 (aucune attaque), 3 PV, mobilité 6, 1 mana. Son passif « Carquois prêt ! » est une **aura** (le « coût 1 mana » du texte est le coût de la carte, pas un coût d'activation) : ses archers impériaux alliés dans son carré de 1 ont **2 attaques par tour au total** (deux Écuyers ne s'additionnent pas ; l'Écuyer lui-même n'en profite pas). La zone est vérifiée **au moment de chaque attaque** : un archer qui a déjà tiré une fois et rejoint la zone peut tirer encore ; s'il en sort ou si l'Écuyer est détruit, il n'a plus que sa limite normale. `attacksMade` compte les attaques du tour ; `hasAttacked` avec 0 attaque faite veut dire « plus d'attaque ce tour » (Zoldik, évolution). La riposte reste limitée à une par tour. **Armé** (nouveau, Flèche explosive et Carreau perforant, 1 mana chacun, **sans limite par tour**) : le monstre est armé jusqu'à sa **prochaine attaque de ce tour** (perdu à la fin du tour sinon) ; **un seul effet armé à la fois**, et seulement s'il lui reste une attaque : il faut attaquer avant d'en réactiver un (avec Carquois prêt !, on peut donc armer entre ses deux tirs). **Flèche explosive** : l'attaque inflige en plus **1 dégât d'effet** (sans riposte ni Carapace, 1 VP par monstre détruit) à chaque monstre ennemi visible dans le **carré de 1 de la case de la cible**, la cible exclue, même si elle est détruite ou si c'est un terrain ; falaises et cases X coupent la zone ; un tir bloqué par un monstre invisible consomme l'armé sans éclats. **Carreau perforant** : **+2 ATK** pour cette attaque (avant Siège et les autres multiplicateurs, compté dans les dégâts annoncés). **Trébuchet des archers** : Siège ×2 (le mot-clé existant) et **`no_cac`** (propriété de la carte, sans nom ni statut) : il ne peut pas attaquer une cible **au contact** (1 case en ligne droite) ; la diagonale à 1 case reste possible (§10, ce n'est pas un contact). **Camps de tir** : terrain à 2 mana, 5 PV, aura +1 portée aux archers impériaux alliés sur **sa case et son carré de 1** (portée effective `getRange(state, monster)` : portée de la carte + bonus du tour + auras ; la menace du prochain tour garde la portée de la carte). **Flèche divine** (×3, 2 mana, inchangée) vise un allié archer impérial. Terrain de chasse ne fait plus partie de ce deck (Vampire seulement). Les 4 nouveaux monstres n'ont pas encore d'illustration ; pas de brillants de démo. L'IA ne modélise ni la 2e attaque, ni l'armé, ni la portée du Camps de tir, ni `no_cac` pour la menace.
- **§4.7 / §10 — Attaque en diagonale jusqu'à portée ÷ 2 (validé le 2026-11-08)** : remplace « à 1 case seulement » du 2026-11-07. Une case de diagonale compte pour 2 de portée (les distances sont orthogonales) : la portée **effective** (carte + bonus du tour + auras) donne `⌊portée ÷ 2⌋` cases de diagonale : 2-3 → 1 case (inchangé), 4-5 → 2, 6 → 3 ; portée 1 : aucune. **Diagonales pures seulement** (pas les cases en L comme (1, 2)). **Ligne de vue** : les cases de la diagonale entre le tireur et la cible doivent être libres (un monstre ou un terrain, allié ou ennemi, arrête le tir : seule la première unité est visée), et chaque pas doit être dans le carré de 1 de la case d'avant au sens du §10 (jouable, un chemin en L sans falaise ni case X ; les unités des cases de coin ne gênent pas) ; un monstre invisible sur la diagonale arrête le tir comme en ligne droite (§10). Pour le reste, une attaque en diagonale n'est pas un contact : ni riposte, ni avancée, ni Trophée ni Pillage, ni bonus de dos ; `no_cac` ne l'interdit pas. Les effets « en ligne » ne changent pas. Menace du prochain tour (`getStrikeCells`) et IA (`reach.ts`) suivent la même portée.
- **§4.4 bis — Correction : le terrain tient la zone, seuls les monstres se comptent (validé le 2026-11-08)** : remplace « le terrain compte 1 unité » du 2026-11-07. En mode contestation, un **terrain** dans la zone de 9 cases la tient pour son propriétaire **qu'importe le nombre de monstres ennemis** ; la **supériorité numérique ne compte que les monstres** (camouflés compris). Sans terrain : plus de monstres = on tient, égalité avec des monstres des deux camps = contestée, aucun monstre = neutre. Deux terrains adverses dans la même zone (cas rare, pas possible en jeu normal) : contestée. Le terrain ne se pose toujours que dans une zone qu'on tient. L'IA tient pour sûre une zone où elle a un terrain, et ne compte que les monstres pour juger la menace (`zoneThreatened`). Le mode Normal ne change pas.
- **§4.7 / §10 — Les alliés ne bloquent pas la ligne de vue (validé le 2026-11-08)** : un monstre **allié** de l'attaquant (§5.1 : un allié est toujours un monstre) ne gêne ni un tir en ligne droite, ni un tir en diagonale : le tir passe par-dessus et vise la première unité qui n'est pas un monstre allié. Les **terrains** (le sien compris) et les **monstres ennemis** arrêtent toujours le tir ; une case qui porte un monstre allié **et** un terrain l'arrête (le terrain). Valable pour les effets « en ligne, portée N » (« comme une attaque », §5.3 : le Mage), pour la menace affichée au survol et pour l'IA. Un monstre allié invisible pour l'adversaire ne gêne pas non plus. Les monstres invisibles **ennemis** arrêtent le tir comme avant (§10).
- **§4.4 bis — Pas de terrain sur une zone contestée (rappel du 2026-11-08)** : confirmé, déjà appliqué : en mode contestation on ne pose un terrain que dans une zone qu'on tient, c'est-à-dire en **supériorité numérique de monstres** (ou avec son propre terrain déjà posé, impossible puisqu'un seul terrain par zone) ; une zone contestée (égalité de monstres des deux camps), neutre, tenue par le nombre de l'adversaire ou par un terrain adverse n'en reçoit pas.
- **§4.7 / §10 — Les terrains alliés ne bloquent pas non plus (validé le 2026-11-08)** : complète l'entrée précédente. Les **terrains alliés** de l'attaquant ne gênent pas le tir, comme ses monstres : le tir (en ligne droite, en diagonale, effet « en ligne ») passe par-dessus toute unité de son camp, monstre ou terrain, et vise la première unité du camp adverse. Un monstre ou un **terrain ennemi** arrête toujours le tir (et un terrain ennemi se vise s'il est le premier). Remplace « les terrains arrêtent toujours le tir, le sien compris » de l'entrée précédente.
- **§4.2 — Plafond du mana de base à 10 (validé le 2026-11-08)** : le **mana de base** du début de tour est plafonné à **10** (`BASE_MANA_CAP`) : 3, 4, 5… jusqu'à 10, atteint au **8e tour de chaque joueur** (tours 15 et 16), puis 10 à chaque tour. **Le mana de zone des terrains s'ajoute par-dessus** (+1 par zone tenue où l'on a un terrain, Autel de mana, Étendard avec un terrain) et n'est pas plafonné : c'est la seule source qui fait dépasser 10 au début du tour. Les autres gains **en cours de tour** (Pillage, effets qui donnent du mana) ne changent pas : ils s'ajoutent sans plafond, comme avant. Le mana non dépensé reste perdu en fin de tour. Remplace « sans plafond » du 2026-11-07 et du §4.10 pour le mana de base ; l'orbe du score reste pleine à 10.
- **§6 bis — Deck Pièges renommé « Maîtres des pièges » et remanié (validé le 2026-11-08)** : même deck (id `pieges`, cartes et quantités inchangées, Pénombre reste), nouveaux noms « Nom - Maîtres des pièges » ; l'archétype `piege` s'affiche « Maîtres des pièges » (« maître des pièges » pour « monstre piège » : Pénombre vise « tous les maîtres des pièges alliés »). **Poseur de piège** : coût 1 → **2** ; **Filet** (1 mana, nom d'effet) : le piège **dure 3 tours adverses** (1 avant). **Poseur de bombe** : coût 1 → **2**, ATK 2 → **1** ; **Bombe** : **1 mana** (2 avant), 3 dégâts (« perd 3 PV » du texte = 3 dégâts d'effet), **3 tours adverses**. **Clown assassin** : ATK 2 → **3**. **Farceur** : mobilité 6 → **7** ; son « Camouflage » est le statut de §5 bis donné en permanence à lui-même : invisible tant qu'aucun monstre ni terrain adverse n'est dans un carré de 2 (Camouflage 2 inchangé). **Attaque par surprise ×N** : nouveau nom du mot-clé Assassin ×N (même règle, §5.6). Règles des pièges, inchangées : « lorsque l'ennemi est sur la case » = l'ennemi **entre** sur la case (§10), le piège ne se déclenche **qu'une fois** puis disparaît, ou disparaît à la fin de ses 3 tours adverses ; il reste même si son poseur est détruit ; « Filet » : immobilisé jusqu'à son prochain tour (`turns: 0`). **Plusieurs filets** peuvent être posés : **1 pose par tour et par poseur** (1x/tour), aucun plafond par poseur, donc jusqu'à 3 filets d'un poseur en même temps ; **un camp n'a qu'un piège par case** (règle du moteur `getTrapCells`, désormais écrite) ; les deux camps peuvent piéger la même case. L'IA estime un piège sur le prochain tour ennemi seulement (elle sous-estime ceux de 3 tours).
- **§6 bis — Terrain de jeu - Maîtres des pièges (validé le 2026-11-08)** : nouveau terrain du deck Maîtres des pièges (×3), **3 mana, 5 PV**, nom donné « Zone de “jeu” » devenu **Terrain de jeu** (le mot « zone » est déjà pris : mot-clé Zone, Zone d'invocation, mana zones). Son effet, sans nom d'effet (la fiche d'effet §5.2 ne s'impose qu'aux monstres), est le **statut Camouflage 1** (« invisible à plus de 1 case » : invisible pour l'adversaire tant qu'aucun de ses monstres ni terrains n'est dans un carré de 1 autour de lui) donné à **ses maîtres des pièges alliés (monstres)** **sur sa case et dans son carré de 1** (`cellAndSquare`), **tant qu'ils y sont** : sans durée, il ne se pose pas et ne s'use pas, il est recalculé à chaque action (`StatAura.camouflage`, `auraCamouflage`, `isHiddenFrom`) ; en sortir, ou la destruction du terrain, les rend visibles aussitôt (aucun drapeau « révélé »). **Cumul** : avec le Camouflage 2 du Farceur ou celui de Pénombre, c'est **la plus grande valeur** qui compte (pas la somme), comme le moteur le faisait déjà ; précision au §5 bis : les statuts de camouflage ne se cumulent pas. Les monstres cachés comptent toujours pour le contrôle d'une zone en contestation (§4.4 bis, l'état de la zone est public). Un seul terrain par mana zone, sur une zone qu'on tient (§4.9). Illustration fournie le 2026-11-08. L'IA ne valorise pas cette aura (elle la prend en compte dans ce qu'elle voit des camouflés, mais ne cherche pas à en profiter).
- **§6 bis — Composition des Maîtres des pièges (donnée le 2026-11-08)** : Pénombre ×3 (×2 avant), Boule de feu ×3 (×1), Terrain piégé ×1 (×2) ; Charge et Bourrasque sortent ; le reste inchangé (25 cartes).
- **§6 bis — Deck Dragons élémentaires refait (validé le 2026-11-08)** : remplace le deck Dragons ; les entrées plus anciennes sur l'Évolution, les zones et les effets des dragons (Déflagration, Raz de marée, Vent violent, Tremblement de terre) ne valent plus que pour l'histoire. Archétype et nom du deck : **Dragons élémentaires** (cartes « Nom - Dragons élémentaires », « dragon élémentaire » au singulier), Jeune dragon compris. **Évolution draconique** (Jeune dragon, 3 mana, une fois par tour, pas le tour de son arrivée) : il est sacrifié (sans VP, au cimetière), et un des 4 dragons élémentaires de son grimoire (Ignis, Aqua, Ventus, Terra ; jamais Origine) arrive à sa place, sans payer son coût, **stun jusqu'à son prochain tour**. **Zone des dragons** (Lance-flamme, Tsunami, Tempête) : 4 directions orthogonales au choix, le dragon se tourne ; les 3 cases en ligne plus les 2 cases en diagonale devant lui (5 cases), coupées par les falaises et cases X. Effets une fois par tour. **Tempête** : 2 dégâts puis recul de 2 cases, loin du dragon. **Nid de dragons** (terrain, 3 mana, 5 PV) : les effets actifs de ses dragons élémentaires sur sa case ou dans son carré de 1 coûtent **1 mana** (fixé, pas une réduction ; `StatAura.effectCost`, `getEffectCost`). **Hurlements** (sort, 1 mana) : le joueur choisit un de ses dragons élémentaires (Jeune dragon compris), les ennemis de son carré de 5, invisibles compris, ont **ATK −1 pendant 1 tour** (statut de stat §5 bis ; « effrayés » n'est que l'ambiance du texte, sans règle) ; **jouable toujours**, même sans ennemi dans la zone ; plusieurs Hurlements se cumulent (§5 bis). **Origine** sort du deck (données gardées). **Composition** : les 5 monstres, Hurlements et Nid de dragons ×3, Autel de mana ×3, Invocateur ×1.
- **§5.3 — Les effets de zone touchent les invisibles (validé le 2026-11-08)** : un effet de zone, « tous les ennemis » ou un sort de zone touche aussi les monstres ennemis invisibles pour le lanceur (le camouflage empêche de voir, il ne protège de rien). Ce qui rend l'effet jouable se juge toujours sur ce que voit le lanceur. Remplace « jamais un monstre invisible pour le lanceur » des entrées plus anciennes (zones des dragons, Vladimir, Brûlure en chaîne, Flèche explosive).
- **§4.2 — Option « Économie : Réserve » (validée le 2026-11-08)** : constat de l'utilisateur, l'écart de stats entre paliers est trop faible ou le mana trop abondant, invoquer de petits monstres n'est pas assez intéressant. Option à part choisie à l'accueil, qui ne change pas l'économie Classique (règle par défaut). Mana de base 3, 4, 5, puis 6 ; le mana se garde ; réserve limitée à 10 + 1 par terrain ; tout gain plafonné, au début du tour comme pendant (Pillage) ; Autel de mana : +2 mana mais +1 de limite seulement ; Étendard : ne monte pas la limite ; terrain détruit : excédent perdu tout de suite ; un dragon à 7 dès son 2e tour est voulu. L'IA compte le mana gardé dans cette économie. L'orbe de mana est pleine à la limite.
- **§4.2 — Mana réglable (validé le 2026-11-08)** : après l'analyse de l'économie (banc IA contre IA : en Classique, la moitié du mana perdue en fin de partie ; en Réserve à 5 mana par tour, autant de cartes jouées par tour qu'à 6, même durée), l'utilisateur veut régler à l'accueil, **dans les deux économies**, la **génération max** (plafond du mana de base : 3, 4… jusqu'à elle ; **5 par défaut**) et la **limite** (**10 par défaut**). Réponses : (1) la limite est **le mana qu'on peut avoir au total**, à tout moment, en Classique comme en Réserve : revenus du début de tour (mana de base et mana des zones) et gains pendant le tour s'y arrêtent, le surplus est perdu ; (2) **plus de +1 de limite par terrain** (un terrain détruit ne change donc plus rien au mana) ; (3) la génération max plafonne **le mana de base**, le mana des mana zones s'ajoute par-dessus, dans la limite. Valeurs proposées : génération 3 à 10, limite 5 à 20 ; dans l'adresse du jeu, `gen` et `lim`, seulement s'ils diffèrent des valeurs par défaut. Remplace le plafond du mana de base à 10 de l'économie Classique, le mana de base 3, 4, 5 puis 6 et la limite 10 + 1 par terrain de la Réserve (entrées ci-dessus).
- **§7 bis — IA : sorts à plusieurs cibles (2026-11-09)** : l'utilisateur a remarqué que l'IA ne lançait jamais les sorts d'archétype récents (Appel du sang, Sacrifice sanguinaire contre lui). Vérifié sur 6 parties en miroir : jamais Appel du sang, Pénombre ni Brûlure en chaîne. Cause : une action se jugeait sur la position juste après elle, plus l'action suivante d'un seul monstre ; un sort à cible `all` n'en a aucune, et +2 mobilité ce tour-ci ne change rien tant qu'on n'a pas bougé : le sort était écarté avant la recherche. Désormais, les sorts et effets à plusieurs cibles (2 au plus) sont toujours essayés par la recherche, qui joue la suite du tour. Un sort gardé au grimoire garde sa valeur (inchangé).
- **§7 — Zones de déplacement, d'attaque et de danger (handoff « zones », validé le 2026-11-08)** : le pion sélectionné montre en halos cyan les cases où il peut aller et en orange celles qu'il peut attaquer (depuis sa case ou une case d'arrêt) ; la **zone de danger** (contour violet) ne s'affiche **que quand un pion est sélectionné** et ne compte **que les monstres adverses visibles sur le plateau** (déplacement et attaque à leur prochain tour ; ni effets actifs, ni sorts). **Cliquer une case orange ne fait rien** (information seulement). **Cliquer un monstre ennemi** montre ses zones cyan et orange, de son point de vue. **Survoler un monstre** montre ses zones dans ce style (les hachures orange et rouges disparaissent). Vues : isométrique du 15 × 15 (PixiJS) et vue de dessus, pour J1 et J2 (le plateau n'est jamais retourné).
- **§5 bis — Norme des statuts (validée le 2026-11-08)** : l'utilisateur a défini la liste des bonus et malus (§5 bis). Décisions : (1) **chaque effet donne sa durée**, comptée en tours de la cible (règle actuelle conservée) ; (2) **Camouflage = invisible à plus de 2 cases** et **Invisible = à plus de 1 case**, deux statuts à valeur fixe, plus de « Camouflage N » : Farceur (mot-clé) et Pénombre restent Camouflage, le Terrain de jeu (aura) donne Invisible (`StatAura.stealth`) ; (3) **Requiem sans paramètre**, fixé à 2 tours (`REQUIEM_TURNS`) ; (4) **tous les statuts de la liste sont implémentés** : Absorbé (lié à l'absorbeur : il gagne les PV que l'Absorbé perd), Absorbation, Récupération X, Épuisé, `<stat>` ±X pour ATK, mobilité, portée et PV max ; (5) une destruction par Absorbé profite à l'absorbeur (comme burn). **Carapace**, que la liste oubliait, est un bonus. Absorbation et Récupération se ressemblent (+PV au début de son tour) : Absorbation vaut 1 PV par instance, Récupération X vaut X. Aucune carte ne les utilise encore.
- **§5 bis — Statut Vol (bonus, validé le 2026-11-08)** : « Vol : peut survoler les cases X » est ajouté aux bonus de la norme. C'est le **mot-clé Vol (§5.6) posé en statut** : mêmes règles (survole les cases `X` et les falaises de la Scierie, pas celles de la Mine, jamais les ennemis, ne termine jamais sur une case `X` ou `.`), pour la durée de l'effet qui le donne (`turns`, en tours de la cible). Le moteur ne distingue pas les deux : `canFly(monster)` vaut le mot-clé **ou** le statut (`movement.ts`, IA : `bot.ts`, `reach.ts`). Aucune carte ne le donne encore.
- **§6 bis / §6 ter — Decks à 30 cartes et sorts génériques (donnés et validés le 2026-11-10)** : chaque deck fait **30 cartes** (le deck Classique, deck d'essai, garde 25), ses cartes d'archétype en 3 exemplaires, avec les compositions du §6 bis. Le deck **Bodybuilder est retiré** : ses cartes restent dans les données, sans deck (comme Jean Bon). Soin, Bénédiction, la Boule de feu (Classique mis à part) ne sont dans aucun deck : leurs données restent. **11 sorts génériques** rejoignent les cartes communes (§6 ter), noms seuls, sans archétype : Puissance, Soin, Flash, Fatigue, Carapace, Élixir de mana (nom donné à « Mana », le nom de la ressource), Cure, Repli (nom français de « Back » ; « Retour » est déjà pris), Téléportation (le nom de l'effet, au même sens), Réanimation, Fortification. Les lectures validées : Puissance, Soin, Flash, Cure et Carapace visent un allié au choix, n'importe où ; **Soin** rend 5 PV tout de suite (soin 5, pas le statut Récupération), jamais sur un allié qui a tous ses PV ; **Flash** pose l'allié sur une case libre à 2 cases au plus de lui, diagonales comprises (« 2 cases adjacentes » au sens du carré de 2, comme le 2026-11-06), **par-dessus les cases X et les falaises** (rien entre les deux ne compte : il peut entrer dans la Mine) ; **Fatigue** : slow 2 pendant 1 tour (« Slow x2 » = slow 2 ; « jusqu'à la fin du prochain tour adverse ») ; **Élixir de mana** : +1 mana pour 0 mana, gardé en Réserve comme tout mana, pas jouable à la limite ; **Cure** retire tous les malus, requiem compris (« retire », pas « soigne » : un soin rend des PV), et l'allié retrouve la mobilité que ses malus lui avaient prise ce tour, jamais sur un allié sans malus ; **Repli** téléporte un allié sur une de ses cases d'invocation libres, au choix, celles du plateau et ses Zones d'invocation comprises, même stun ou immobilisé, pas jouable si toutes sont occupées ; **Téléportation** : un allié sur la case d'un de ses terrains où aucun monstre ne se trouve (il la partage avec le terrain, §4.9) ; **Réanimation** : un monstre de son cimetière au choix revient sur une de ses cases d'invocation libres, sans payer son coût, avec tous ses PV, sans statut, et peut agir aussitôt ; il quitte le cimetière, ce n'est pas une carte jouée ; un exemplaire brillant revient brillant ; pas jouable sans monstre au cimetière ni case libre ; **Bourrasque** passe à 1 mana, direction au choix ; **Charge** ne change pas. Flash, Repli et Téléportation suivent les règles de la téléportation (§5.4) : il garde sa mobilité, son attaque et son orientation, et entre sur la case d'arrivée.
- **§5 bis — Carapace : ne descend pas sous 1 PV (validé le 2026-11-10)** : le statut carapace prend le sens de la carte Carapace (« garde 1 PV ») : **ses PV ne descendent pas sous 1**, quels que soient les dégâts (attaque, riposte, sort, effet, piège, Passage, Zone, burn, absorbé), pendant toute sa durée ; **le burn du début de son prochain tour est bloqué aussi** (la carapace tombe juste après les statuts du début de tour, sinon elle ne bloquerait jamais un burn). Requiem le tue quand même. Sans destruction : ni VP, ni avancée. Une absorption ne rend que les PV vraiment retirés (Vladimir). Le Tortank de Tibo (hors deck) pose ce même statut. **Fortification** le pose sur un de ses terrains (« Sur un terrain, seuls burn et carapace s'appliquent ») : un burn ne détruit pas le terrain tant qu'il l'a.
- **§6 — Boule de feu (validé le 2026-11-10)** : 1 dégât (au lieu de 2) à un ennemi **dans un carré de 3 d'une de ses unités**, monstres et terrains (au lieu de « à 3 pas d'un de ses monstres ») ; le carré est coupé par les falaises et les cases X : plus de Boule de feu à travers les parois de la Mine.
- **§6 bis — Terrain de chasse - Vampire (validé le 2026-11-10)** : le Terrain de chasse devient un terrain de l'archétype Vampire (« Terrain de chasse - Vampire ») : son +1 mobilité au déplacement ne vaut que pour ses vampires. Il entre dans le deck Vampire ×3, à la place des 3 Autels de mana (le deck : ses 7 cartes d'archétype ×3, Cure ×3, Carapace ×3, Puissance ×2, Flash ×1).
- **§4.6 / §10 — Déplacement arrêté par un monstre invisible : il garde sa mobilité (validé le 2026-11-10)** : le monstre s'arrête sur la dernière case de son chemin où il peut s'arrêter, comme avant, mais garde sa mobilité restante (les pas faits sont dépensés) : il peut repartir, autour du monstre révélé. Un arrêt forcé sur un allié (immobilisé ou stun en y entrant) reste sans plus de mobilité.
- **§5.6 — Soif : jamais contre un terrain (validé le 2026-11-10)** : remplace « aussi contre un terrain » : un vampire qui attaque un terrain ne récupère rien.
- **§5.4 — Retour vers le futur : il peut encore bouger (validé le 2026-11-10)** : après le retour, le monstre garde la mobilité qui lui restait (sans regagner les pas déjà faits) et peut se déplacer ; son chemin du tour repart de la case retrouvée. Le sablier, lui, arrête toujours le déplacement.
- **§6 bis — Flèche explosive sur une case vide (validé le 2026-11-10)** : armé de la Flèche explosive, l'Archer impérial peut tirer sur une **case vide** au lieu d'une unité : une case qu'il pourrait attaquer (en ligne droite avec ligne de vue, ou en diagonale jusqu'à portée ÷ 2), sans unité. C'est son attaque (elle consomme l'arme et compte dans ses attaques du tour) ; les éclats touchent les ennemis du carré de 1 de la case (invisibles compris), jamais un allié ; pas de riposte ni d'avancée. Un monstre invisible sur la ligne arrête le tir, comme pour une attaque ; un monstre invisible **sur la case visée** est touché : c'est une attaque normale sur lui (dégâts et éclats autour), et il se révèle. À l'écran : les cases vides visables s'allument en orange ; un clic ouvre la bulle « Tirer ici » (et « Y aller » si la case est aussi à sa portée de marche).
- **§4.10 — VP pour gagner réglables (validé le 2026-11-10)** : choisis à l'accueil, de 10 à 50, de 5 en 5, 30 par défaut ; dans l'adresse du jeu (`vp=`) seulement s'ils ne sont pas 30 ; la barre du haut et le journal du début de partie les disent ; une partie en ligne les prend des réglages de l'hôte.
- **§7 — Direction à choisir en vue isométrique (2026-11-10)** : dans la bulle (Bourrasque, recul au choix), chaque direction se montre en croix de manette couchée dans le plan du plateau isométrique, le bras de la direction en doré : « vers le haut » se lit sur le plateau (en haut à droite à l'écran).
- **§5 bis — Slow, seul malus de mobilité (validé le 2026-11-11)** : Slow N et « mobilité −X » avaient exactement le même effet (mobilité en moins, cumul, effet immédiat pendant le tour) : deux mots pour une notion. Le malus de mobilité s'appelle désormais toujours **Slow N** ; `<stat>` −X ne vaut plus que pour l'ATK, la portée et les PV max, et la mobilité garde son bonus (mobilité +X). Un effet écrit « mobilité −X » pose un slow X (`normalStatus` dans `statuses.ts`, par lequel passent `addStatus` et les textes). Aucune carte n'utilisait mobilité −X.
- **§5 bis — Épuisé devient Désarmé (validé le 2026-11-11)** : le statut qui empêche d'attaquer (déplacement et effets actifs restent possibles) s'appelle **Désarmé** (`desarme`), le mot qui dit ce qu'il fait ; son effet ne change pas. L'utilisateur garde ce nom malgré l'état **Armé** des Archers impériaux (la prochaine attaque porte un bonus) : ce sont deux notions distinctes, Désarmé ne retire pas un Armé. Aucune carte n'utilisait Épuisé.
- **§4.3 / §7 — Sur le plateau remplace les cartes jouées (validé le 2026-11-11)** : la liste des cartes jouées disparaît : un sort lancé finit au cimetière, un monstre ou un terrain est sur le plateau ou, s'il l'a quitté, au cimetière. Le compteur « Plateau » de chaque joueur compte ses unités sur le plateau, **invisibles et camouflées comprises**, aussi pour son adversaire : on sait toujours ce qui a été joué, Invisible et Camouflage ne cachent que la position. Son panneau montre leurs cartes (pas brillantes tant que l'unité est cachée), jamais leur case. Dans la vue d'un joueur, `OpponentView.onBoardHidden` donne les cartes des unités adverses qu'il ne voit pas ; l'état ne garde plus de liste `played`. Remplace la liste des cartes jouées de l'entrée « Cartes jouées et cimetière » ci-dessus.
- **§7 — Mana zones à l'écran (validé le 2026-11-11)** : au repos, une lueur à la couleur de la zone (neutre dorée, du joueur qui la tient, ou contestée) dans son carré (3 × 3 en contestation), la case centrale éclairée, sans trait, et **l'icône de la zone incrustée dans sa case centrale** (validé le 2026-11-11 : enclume, fer à cheval, blé, scie, pioche ; couchée dans le sol dans l'axe de la tuile, en creux, de la couleur de la zone assombrie avec un liseré clair, sous les jetons ; pas sous les marques d'un « Passage » ou d'une case brûlée) ; quand la souris passe sur la zone (une de ses 9 cases en contestation), un trait fin au bord, les quatre coins, un cercle fin autour de la case centrale, et le nom de la zone. **Le nom ne s'affiche qu'au survol** (validé le 2026-11-11) : il porte son icône et dit ce qu'elle rapporte (« +1 VP ») ou qui la tient (« J1 », « J2 », « Contestée ») ; il passe devant le décor. Vue isométrique (plateau PixiJS) ; la vue de dessus garde l'ancien dessin, avec l'icône, et son nom aussi seulement au survol.
- **§7 — Icônes (validé le 2026-11-11)** : toutes de game-icons.net, comme avant. VP : une couronne (plus les lauriers). Chaque statut a son icône : stun, étoiles en orbite ; désarmé, l'arme qui tombe ; absorbé, des crocs (rouges, malus), et absorbation les mêmes crocs (verts, bonus) ; camouflage, une capuche ; invisible, l'œil barré ; carapace, une carapace de tortue ; récupération, un soin ; vol, une aile ; silence, un visage bâillonné ; requiem, la tête de mort. Slow et immobilisé reprennent la botte de la mobilité, avec ▼ pour slow et ✕ pour immobilisé ; un statut de stat garde l'icône de sa stat avec ▲ (bonus) ou ▼ (malus). Destruction : la pierre tombale du cimetière. Journal : PV gagnés et perdus ont leur icône ; le lancer de dés, un dé.
- **§7 — Journal en arborescence et repliable (validé le 2026-11-11)** : chaque action est une ligne (icône de son type dans une pastille cerclée à la couleur du joueur, sa phrase), et ses conséquences pendent dessous, reliées par un trait, chacune avec son icône et sa couleur (perte en rouge, gain en vert, VP en or, information) ; une conséquence qui en entraîne une autre la porte sous elle : les VP gagnés sous la destruction qui les rapporte (quand une seule unité adverse est détruite), « tient à 1 PV (carapace) » sous la perte de PV. Les noms des cartes sont soulignés à la couleur de leur camp (le nom complet au survol) et « J1 », « J2 » s'écrivent « Joueur 1 », « Joueur 2 » à leur couleur. Chaque tour commence par un séparateur à la couleur du joueur (numéro, mana et VP reçus), puis, s'il s'est passé quelque chose au début du tour (statuts, requiem…), une ligne « Début du tour » qui le porte ; la dernière action est mise en avant. Le journal s'ouvre plus grand (un tiers de la colonne de gauche, entre 180 et 300 px ; la fiche se réduit d'autant) et se replie en une barre qui montre la dernière entrée ; ouvert ou replié, le choix est mémorisé (ouvert par défaut). Replié, au début de son tour, la barre dit « Ce qu'a fait Joueur N » avec un badge qui compte les actions de l'adversaire pendant son tour, jusqu'à ce que le joueur l'ouvre.
- **§7 — Fiche plein cadre et état au jeton (validé le 2026-11-11)** : la fiche ne dit que ce que fait la carte. **Fiche** : l'illustration couvre toute la carte, sans fondu au noir ; le coût en mana dans un rond bleu en haut à droite, comme dans le grimoire (aussi sur chaque effet actif) ; en bas, le nom et l'archétype posés sur le dessin, sans bloc (le camp « J1 »/« J2 » d'une unité du plateau à droite du nom) ; puis des blocs séparés de verre à peine flouté pour voir le dessin derrière : les stats (4 colonnes séparées d'un trait, icône colorée et chiffre, nom en petites capitales dessous ; sur le plateau, les valeurs du moment, bonus et malus en pastille), l'effet passif (ambre), un bloc par effet actif (violet, son nom en gras devant le texte). Plus de lignes de disponibilité (« Attaque disponible », « Invocation », mana manquant, état d'un effet, riposte prête), ni de statuts ou d'effets en cours, ni de menace d'un monstre adverse sur la fiche. **Au jeton** : au-dessus de la goutte, une pastille de ce qu'il peut encore faire ce tour (épée = attaque, tourbillon = effet actif ; ses monstres, à son tour ; rien quand plus rien n'est possible) ; ses statuts restent à gauche ; au survol (un quart de seconde, puis d'un jeton à l'autre aussitôt), une infobulle : son nom, « ton tour » / « tour adverse » / « adversaire », l'attaque et chaque effet actif avec leur état, la riposte, la menace d'un monstre adverse (mobilité et portée de son prochain tour), les statuts avec les tours qu'il leur reste, puis les effets en cours en phrases (bonus du tour, aura, armé, camouflé ou repéré, mana zone, terrain). **Grimoire** : sous une carte injouable, monstres compris, la raison (« Il te manque 3 mana » en orange, ou « Aucune cible à portée »…), à la place de ses stats en liste, sous elles en tuile. Maquettes : canevas « Variantes de cartes » (pistes E et J).

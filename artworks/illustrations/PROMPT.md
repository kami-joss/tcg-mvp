# Illustrations de cartes : prompt et gabarit

À chaque demande :
1. Joins `gabarit-9x16.png` comme **image de référence** (composition seulement).
2. Colle le prompt ci-dessous et remplace les [crochets].
3. À la réception, pose `calque-verification-9x16.png` par-dessus (calque transparent) et passe la checklist.

## Prompt (français)

```
Illustration de carte pour un jeu de cartes tactique fantasy.
Sujet : [NOM DE LA CARTE], [qui c'est, tenue, attitude en une phrase].
Action : [ce qu'il fait], [arme ou sort] tenu au niveau du buste.
Cadrage : image verticale 9:16 (1024×1792). Plan large, personnage en pied, centré, de face ou de trois-quarts, regard vers le spectateur. La tête dans le cinquième supérieur de l'image, les yeux à environ 13 % du haut. Le personnage et son arme restent dans les 80 % centraux en largeur.
Fond : [lieu], simple et légèrement flou ; le quart inférieur (sol) calme et peu détaillé.
Style : anime fantasy, couleurs saturées, lumière chaude, contours nets, cohérent avec le reste de la série.
Contraintes : pas de texte, pas de logo, pas de cadre, pas de bordure, pas de filigrane.
L'image jointe est un guide de composition : respecte ses zones, mais n'en reproduis ni les lignes, ni les couleurs, ni le texte.
```

## Prompt (anglais, souvent mieux compris)

```
Card illustration for a fantasy tactical card game.
Subject: [CARD NAME], [who, outfit, attitude in one sentence].
Action: [what they do], [weapon or spell] held at chest height.
Framing: vertical 9:16 image (1024×1792). Wide shot, full-body character, centered, front or three-quarter view, looking at the viewer. Head in the top fifth of the image, eyes about 13% from the top. Character and weapon stay within the central 80% of the width.
Background: [place], simple and slightly blurred; bottom quarter (ground) calm with little detail.
Style: fantasy anime, saturated colors, warm lighting, crisp outlines, consistent with the rest of the series.
Constraints: no text, no logo, no frame, no border, no watermark.
The attached image is a composition guide only: follow its zones, do not reproduce its lines, colors or text.
```

Midjourney : ajoute `--ar 9:16`.

## Exemple rempli : Archer de glace

```
Sujet : Archer de glace, jeune chasseur en manteau de fourrure bleu pâle, regard concentré.
Action : il bande un arc de cristal, une flèche de givre encochée au niveau du buste.
Fond : lac gelé au crépuscule, simple et légèrement flou ; le sol enneigé calme et peu détaillé.
```

## Checklist à la réception (avec le calque)
- Les yeux sont sur ou près de la ligne pointillée jaune (13 %).
- Toute la tête est au-dessus de la ligne jaune pleine (18 %).
- L'arme ou le sort est entre les lignes jaune (18 %) et bleue (75 %).
- Rien d'important dans les marges de 10 % sur les côtés.
- Le bas de l'image est calme : il passe sous les stats.
- Aucun texte, cadre ni bordure.

Voir `exemple-archer-du-feu.jpg` : la tête est trop basse (yeux vers 22 %) et la boule de feu sort de la marge droite. L'image reste utilisable avec un point focal, mais ce n'est pas l'idéal.

## Si l'image ne respecte pas tout à fait le gabarit
Pas besoin de la refaire. Dans `Plateau v9.dc.html`, renseigne le centre du visage :

```js
static FOCUS = { archer_feu: [38, 23, 48] }; // [x %, y %, largeur du jeton en % de la largeur]
```

## Livraison
- Nom du fichier : la clé de la carte (`archer_glace.jpg`), dans `assets/art/`.
- Ajoute la ligne dans `static ART` : `archer_glace: 'assets/art/archer_glace.jpg'`.
- JPG de qualité 85 à 90, 1024 × 1792 ou 1080 × 1920.

# SOPP Agents

Bibliothèque personnelle des applications web développées par Adam Soppelsa.

## Applications référencées

- **ActuSUP** — veille des communicants, articles de médias francophones, recherche, filtres et baromètre des sujets.
- **Cocon-S-mantique-Studcorp** — carte mentale éditoriale STUDCORP : blog, mots-clés, pages et articles.
- **G.E.N.I.S** — assistant personnel web installable, conversation vocale et textuelle, mémoire locale et outils IA.
- **ITSoppSTUDCORP** — cartes mentales interactives EcoSTUD et MediSTUD autour de la mobilité étudiante.
- **SOPP-Language** — interprète multilingue avec traduction orale, conversation, texte et documents.

La bibliothèque et la recherche affichent ces cinq applications dans le même ordre alphabétique.

## Icônes et installation

Le logo de l'onglet et les icônes d'installation sont dérivés de **assets/logo-app.webp**.
Le workflow génère les formats PNG et ICO nécessaires aux navigateurs et aux raccourcis d'écran d'accueil :

- favicon PNG 32 × 32 et favicon ICO multi-tailles ;
- icône Apple Touch 180 × 180 pour iPhone et iPad ;
- icônes PWA Android et bureau 192 × 192 et 512 × 512, avec une variante maskable ;
- tuile Windows 150 × 150.

Les fichiers dérivés sont créés automatiquement dans `assets/` lors de chaque déploiement, sans altérer le fichier source.

## Développement

Le site est statique et ne nécessite aucune compilation JavaScript. Les fichiers principaux sont `index.html`, `styles.css` et `app.js`. Le fond est un SVG créé pour le site (`assets/chrome-wave.svg`) afin de rester net sur les écrans haute définition.

Le symbole de marque utilisé dans l'en-tête est conservé dans `assets/brand-mark.webp` ; le logo LinkedIn fourni est dans `assets/linkedin.webp`.

## Déploiement GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` publie le contenu du dépôt sur GitHub Pages à chaque push sur `main`, et peut aussi être lancé manuellement depuis l'onglet **Actions**.

**Activation initiale requise une seule fois :** dans le dépôt, ouvre Settings → Pages, puis dans Build and deployment sélectionne **GitHub Actions** comme Source et enregistre.

Adresse du site : https://sopp24.github.io/SOPP-agents/.

## Recherche

La recherche accepte les noms, catégories et mots-clés, ignore les accents et permet la navigation au clavier : ⌘ K / Ctrl K, flèches, Entrée et Échap.

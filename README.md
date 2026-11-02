# SOPP Agents

Bibliothèque personnelle des applications web développées par Adam Soppelsa.

## Applications référencées

- **Cocon-S-mantique-Studcorp** — carte mentale éditoriale STUDCORP : blog, mots-clés, pages et articles.
- **G.E.N.I.S** — assistant personnel web installable, conversation vocale et textuelle, mémoire locale et outils IA.
- **ActuSUP** — veille des communicants, articles de médias francophones, recherche, filtres et baromètre des sujets.
- **SOPP-Language** — interprète multilingue avec traduction orale, conversation, texte et documents.
- **ITSoppSTUDCORP** — cartes mentales interactives EcoSTUD et MediSTUD autour de la mobilité étudiante.

## Développement

Le site est statique et ne nécessite ni compilation ni dépendance externe. Les fichiers index.html, styles.css et app.js suffisent au fonctionnement de la bibliothèque. Le fond chromé est un SVG créé pour le site (assets/chrome-wave.svg) ; il reste net sur les écrans haute définition et s'adapte aux différentes tailles d'écran.

Le symbole SOPP fourni est décliné en assets/brand-mark.webp pour l'affichage et la favicon ; le logo LinkedIn fourni est conservé en assets/linkedin.webp.

## Déploiement GitHub Pages

Le workflow .github/workflows/deploy-pages.yml publie automatiquement le contenu du dépôt sur GitHub Pages à chaque push sur main, et peut aussi être lancé manuellement depuis l'onglet Actions. Il utilise les actions officielles GitHub Pages.

**Activation initiale requise une seule fois :** dans le dépôt, ouvre Settings → Pages, puis dans Build and deployment sélectionne **GitHub Actions** comme Source et enregistre. Le jeton standard du workflow ne possède pas les permissions d'administration nécessaires pour créer lui-même un site Pages qui n'a jamais été activé ; cette sélection doit donc être faite par un administrateur du dépôt.

Ensuite, l'adresse du site est : https://sopp24.github.io/SOPP-agents/. Le workflow se lancera automatiquement à chaque nouveau push sur main ; pour publier immédiatement après l'activation, lance aussi **Deploy SOPP Agents to GitHub Pages → Run workflow** dans l'onglet Actions.

## Recherche

La recherche accepte les noms, catégories et mots-clés, ignore les accents et permet la navigation au clavier : ⌘ K / Ctrl K, flèches, Entrée et Échap.

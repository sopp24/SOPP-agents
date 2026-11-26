# SOPP Agents

Bibliothèque personnelle des applications web développées par Adam Soppelsa.

## Applications référencées

- **ActuSUP** — veille des communicants, articles de médias francophones, recherche, filtres et baromètre des sujets.
- **Cocon-S-mantique-Studcorp** — carte mentale éditoriale STUDCORP : blog, mots-clés, pages et articles.
- **DRESSOPP** — assistant personnel de style : découverte de vêtements, apprentissage des préférences, garde-robe et tenues inspirées du tableau Pinterest `mode`.
- **G.E.N.I.S** — assistant personnel web installable, conversation vocale et textuelle, mémoire locale et outils IA.
- **ITSoppSTUDCORP** — cartes mentales interactives EcoSTUD et MediSTUD autour de la mobilité étudiante.
- **MEUST** — sonomètre acoustique web : mesure par microphone ou audio d’onglet, étalonnage indicatif et compagnon Deezer pour piloter le lecteur du navigateur. [Application](https://sopp24.github.io/SOPP-agents/sonometre/) · [Code source](https://github.com/sopp24/SOPP-agents/tree/main/sonometre).
- **PEPPER** — compagnon de voyage autonome : hébergement, billets et trajets train / avion / voiture, marges d’arrivée, itinéraire, activités à cocher, météo et budget. [Application](https://sopp24.github.io/PEPPER/) · [Dépôt dédié](https://github.com/sopp24/PEPPER). PIMI est piloté depuis ChatGPT ; les données restent locales.
- **RugbyXVNews** — média consacré au rugby français et international : actualités, centre de match, calendriers, classements, articles, galerie et podcasts. [Application](https://sopp24.github.io/RugbyXVNews/) · [Dépôt dédié](https://github.com/sopp24/RugbyXVNews).
- **SOPP-Language** — interprète multilingue avec traduction orale, conversation, texte et documents.

La bibliothèque SOPP Agents référence neuf applications.

## Bouton de retour partagé

Les applications hébergées dans les dépôts gérés par `sopp24` chargent le script commun `sopp-home-float.js`. Il s'active lorsque l'application est ouverte avec le paramètre `?from=sopp-agents`. Le script crée automatiquement le bouton si la page ne le fournit pas déjà, applique la même apparence à tous les sites et conserve le logo SOPP. Un clic normal revient au hub ; un appui maintenu pendant **0,7 seconde** permet de déplacer le bouton. Sa position est mémorisée sur l'appareil et reste dans les limites de l'écran.

Pour intégrer le bouton, charger simplement le script commun dans la page de l'application :

```html
<script src="https://sopp24.github.io/SOPP-agents/sopp-home-float.js" defer></script>
```

## Développement

Le site est statique et ne nécessite aucune compilation JavaScript. Les fichiers principaux sont `index.html`, `styles.css` et `app.js`. Le fond est un SVG créé pour le site (`assets/chrome-wave.svg`) afin de rester net sur les écrans haute définition.

Le symbole de marque utilisé dans l'en-tête est conservé dans `assets/brand-mark.webp` ; le logo LinkedIn fourni est dans `assets/linkedin.webp`.

## Déploiement GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` publie le contenu du dépôt sur GitHub Pages à chaque push sur `main`, et peut aussi être lancé manuellement depuis l'onglet **Actions**.

**Activation initiale requise une seule fois :** dans le dépôt, ouvre Settings → Pages, puis dans Build and deployment sélectionne **GitHub Actions** comme Source et enregistre.

Adresse du site : https://sopp24.github.io/SOPP-agents/.

## Recherche

La recherche accepte les noms, catégories et mots-clés, ignore les accents et permet la navigation au clavier : ⌘ K / Ctrl K, flèches, Entrée et Échap.

# PIMIENTOS — Travel Companion

PIMIENTOS est un compagnon de voyage responsive, installable et pensé pour GitHub Pages. L'application est statique, sans étape de compilation. Elle est intégrée au portail SOPP Agents et utilise son bouton de retour partagé.

## Fonctionnalités

- Carnets multi-voyages : destination, dates, voyageurs, budget, devise, hébergement et notes.
- Carte interactive OpenStreetMap avec géocodage des destinations et points d'intérêt.
- Prévisions météo de destination via Open-Meteo.
- Itinéraire, fiches d'activités, durée estimée, adresse, budget, priorité, réservation et liens utiles.
- Raccourcis Google Maps, Plans, Waze, stations-service, SNCF Connect, Skyscanner et FlixBus. Les achats et réservations restent sur les plateformes officielles.
- Suivi du budget, dépenses, checklist, export JSON et calendrier ICS.
- Stockage local, cache PWA et synchronisation des voyages dans un fichier versionné GitHub.
- Agent PIMI connecté à l'API OpenAI Responses avec recherche web, questions de cadrage, priorité, contraintes et préparation d'une activité.
- Les secrets restent dans Cloudflare Worker : aucune clé OpenAI ni aucun token GitHub dans le navigateur.

## Démarrer

Ouvre le dossier pimientos/ via GitHub Pages. Au premier lancement, crée un voyage. Les informations sont conservées localement dans le navigateur. Le fichier pimientos/data/trips.json est la source de données partagée.

Adresse prévue : https://sopp24.github.io/SOPP-agents/pimientos/

## Connecter l'agent IA et la synchronisation GitHub

GitHub Pages ne doit jamais recevoir directement une clé OpenAI ou un token GitHub dans son JavaScript client. L'agent et la synchronisation passent par Cloudflare Worker.

1. Installe Wrangler et connecte-toi à Cloudflare.
2. Depuis le dossier pimientos/worker/, déploie avec : npx wrangler deploy
3. Ajoute la clé API OpenAI comme secret Worker : npx wrangler secret put OPENAI_API_KEY
4. Crée un fine-grained personal access token GitHub limité au dépôt sopp24/SOPP-agents, avec Contents: Read and write, puis ajoute-le comme secret : npx wrangler secret put GITHUB_TOKEN
5. Conserve les variables PIMIENTOS_ALLOWED_ORIGIN=https://sopp24.github.io, GITHUB_OWNER=sopp24, GITHUB_REPO=SOPP-agents, GITHUB_BRANCH=main et PIMIENTOS_DATA_PATH=pimientos/data/trips.json.
6. Dans PIMIENTOS, ouvre Réglages et colle l'URL du Worker, par exemple https://pimientos-agent.<compte>.workers.dev.

Le modèle par défaut est gpt-6-astra avec un effort de raisonnement élevé et l'outil de recherche web. Tu peux ajuster OPENAI_MODEL et OPENAI_REASONING_EFFORT. L'utilisation de l'API OpenAI est facturée séparément de l'abonnement ChatGPT.

## Comportement de PIMI

PIMI suit un processus conversationnel. Lorsqu'une activité est proposée, il vérifie le contexte, pose les questions manquantes, cherche les informations actuelles, explique la priorité et prépare une fiche structurée. L'utilisateur conserve le dernier mot : l'activité n'est ajoutée au programme qu'après validation.

Les informations d'ouverture, prix et réservations peuvent changer. PIMI distingue les informations vérifiées, les estimations et les points à confirmer, et fournit des sources. Il ne réserve ni n'achète jamais de billet à la place de l'utilisateur.

## Données et confidentialité

- Les voyages non synchronisés restent dans le stockage local du navigateur.
- Les demandes adressées à PIMI passent par le Worker et OpenAI lorsque le service est activé.
- OPENAI_API_KEY et GITHUB_TOKEN sont conservés dans les secrets du Worker.
- La synchronisation écrit uniquement pimientos/data/trips.json dans le dépôt configuré.
- Carte : OpenStreetMap/Nominatim. Météo : Open-Meteo.
- Les liens transport ouvrent des plateformes externes. L'application ne connaît pas les disponibilités de billets et n'accède pas aux comptes de réservation.

## Déploiement

Le workflow GitHub Pages de SOPP Agents publie le dépôt entier à chaque push sur main. Le dossier pimientos/ est servi automatiquement à son chemin. Le bouton de retour est activé via ?from=sopp-agents et utilise sopp-home-float.js.

## Dépendances

Leaflet 1.9.4, OpenStreetMap, Nominatim, Open-Meteo, Cloudflare Workers et l'API OpenAI Responses avec web_search. Aucun secret ne doit être ajouté aux fichiers statiques.
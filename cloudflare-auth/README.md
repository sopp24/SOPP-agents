# SOPP Agents — service d'authentification Cloudflare

Ce service ajoute une vérification WebAuthn côté serveur. Il est volontairement séparé du site statique : tant que le Worker n'est pas déployé et testé, le site existant continue de fonctionner sans changement.

## Architecture

- Origine autorisée : `https://sopp24.github.io`
- RP ID WebAuthn : `sopp24.github.io` (ne pas inclure le chemin `/SOPP-agents/`)
- Vérification des attestations et signatures avec `@simplewebauthn/server`.
- Clés publiques, compteurs et challenges stockés dans D1.
- Challenge à usage unique, expiration après 5 minutes.
- Session signée côté serveur, valable 8 heures.
- Limitation de fréquence : 60 requêtes par fenêtre de 10 minutes et par adresse IP (sauf la simple vérification d'un jeton, `/session`).
- Inscription de chaque appareil (Face ID sur iPhone, Touch ID sur Mac…) protégée par le secret `ENROLLMENT_SECRET`, jusqu'à 5 appareils ; identifiant utilisateur aléatoire par appareil pour que les passkeys ne s'écrasent pas via le trousseau iCloud.
- CORS limité à l'origine GitHub Pages exacte.

Le service authentifie l'accès au hub. Il ne rend pas privés les fichiers statiques de GitHub Pages ni les applications externes liées dans le catalogue. Pour protéger également ces applications, elles devront chacune vérifier une session ou être servies derrière un proxy authentifié.

## Configuration Cloudflare

1. Dans Cloudflare Dashboard, ouvre **Workers & Pages** et crée une base **D1** nommée `sopp-agents-auth`.
2. Copie l'identifiant de la base et remplace `REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID` dans `wrangler.toml`.
3. Depuis le dossier `cloudflare-auth`, installe les dépendances avec `npm install`.
4. Initialise la base : `npm run db:init`.
5. Dans **Workers & Pages**, crée ou connecte le Worker `sopp-agents-auth`, avec ce dossier comme répertoire du projet, puis déploie avec `npm run deploy`.
6. Ajoute les secrets dans **Worker → Settings → Variables and Secrets** (type Secret) :
   - `SESSION_SECRET` : valeur aléatoire d'au moins 32 caractères.
   - `ENROLLMENT_SECRET` : code aléatoire d'au moins 32 caractères, à conserver hors du dépôt.
7. Ne partage jamais ces secrets dans une conversation, dans GitHub, ni dans le code du site.

Tu peux générer deux valeurs aléatoires distinctes dans un terminal local avec :
`openssl rand -base64 48`

## Vérification avant raccordement du site

Une fois le Worker déployé, son URL doit répondre à :

`GET https://<nom-du-worker>.<compte>.workers.dev/health`

Réponse attendue : `{"status":"ok","service":"sopp-agents-auth"}`.

Ne raccorde pas encore le site tant que cette vérification ne fonctionne pas. ## Raccordement du site au Worker

`biometric-lock.js` sait déjà dialoguer avec le Worker (champ « Code d'inscription », lien « Ajouter cet appareil », vérification de la signature côté serveur). Il reste en **mode local** tant que la constante `AUTH_URL` (en haut du fichier) est vide.

1. Déploie le Worker et vérifie `/health` (voir plus haut). Si le Worker avait déjà été déployé avec l'ancien schéma à une seule clé, exécute une fois `npx wrangler d1 execute sopp-agents-auth --remote --file=./migrations/0002_multi_device.sql`.
2. Renseigne `AUTH_URL` dans `biometric-lock.js` avec l'adresse du Worker, puis déploie le hub.
3. Sur chaque appareil : ouvre SOPP Agents, clique sur « Ajouter cet appareil », saisis `ENROLLMENT_SECRET`, puis crée la clé Face ID / Touch ID.
4. Renseigne la même adresse dans la constante `AUTH_URL` de `sopp-gate.js` de chaque application verrouillée (ActuSUP, DRESSOPP, G.E.N.I.S, PEPPER, RugbyXVNews, SOPP-Language) : elles vérifient alors le jeton auprès du Worker et refusent les jetons « locaux ».

Le secret d'inscription n'apparaît jamais dans le dépôt : il n'existe que dans les secrets Cloudflare et dans ta tête.

## Endpoints

- `POST /register/options` — options d'inscription, avec en-tête `X-Enrollment-Code`.
- `POST /register/verify` — vérifie l'attestation et enregistre la clé publique.
- `POST /auth/options` — génère un challenge d'authentification.
- `POST /auth/verify` — vérifie la signature et retourne un jeton de session signé.
- `GET /session` — vérifie le jeton de session transmis en Bearer.
- `GET /health` — contrôle de disponibilité.

Les challenges sont à usage unique et expirent après cinq minutes. La session expire après dix minutes. Le navigateur devra conserver le jeton uniquement en mémoire ou dans `sessionStorage`, jamais dans une URL.

## Sécurité et limites

- La clé privée biométrique reste dans l'authentificateur de l'appareil.
- Seule la clé publique est stockée dans D1.
- La vérification de signature, de challenge, d'origine, de RP ID et de présence utilisateur est faite côté Worker.
- Le secret d'inscription n'est demandé qu'à l'ajout d'un appareil ; change-le dans Cloudflare s'il a pu être exposé.
- Les applications externes et les dépôts publics restent accessibles directement tant qu'ils ne sont pas protégés indépendamment.

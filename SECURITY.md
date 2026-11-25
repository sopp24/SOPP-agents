# Sécurité et verrouillage d'accès

## Ce que le verrou fait

- SOPP Agents est protégé par **Face ID** (téléphone), **Touch ID** (Mac) ou **Windows Hello** (PC) via WebAuthn.
- Une fois déverrouillé, le hub ouvre les applications avec un jeton d'accès placé dans le **fragment d'URL** (`#sopp-access=…`, jamais envoyé au serveur). Chaque application verrouillée (`sopp-gate.js`) lit ce jeton, l'efface de l'adresse, puis se déverrouille. Sans jeton valide, elle affiche un écran « Ouvrir SOPP Agents ».
- L'accès expire après 30 minutes d'inactivité et au plus tard à l'échéance du jeton (8 h).
- Applications verrouillées : ActuSUP, DRESSOPP, G.E.N.I.S, PEPPER, RugbyXVNews, SOPP-Language.

## La clé d'accès est secrète

- Aucune clé, aucun code ni aucun secret n'est dans le dépôt.
- La clé privée biométrique ne quitte jamais l'appareil (puce sécurisée / trousseau). Le navigateur ne garde que l'identifiant public de la clé.
- Le code d'inscription (`ENROLLMENT_SECRET`) et la clé de signature des sessions (`SESSION_SECRET`) sont des **secrets Cloudflare**, jamais dans GitHub.

## Limite à connaître : un dépôt public est lisible

Le dépôt et le site sont des fichiers statiques **publics** : n'importe qui peut lire le code ou le cloner, et un verrou écrit en JavaScript côté navigateur peut être contourné par quelqu'un qui le désactive dans sa propre copie. Ce verrou empêche l'usage normal des applications en dehors de SOPP Agents ; il **n'empêche pas** la copie du code.

Pour rendre le contenu réellement inaccessible :

1. Passe les dépôts en **privé** (Settings → General → Danger Zone → Change visibility).
2. Sers les applications derrière un service authentifié (par exemple Cloudflare Pages + Cloudflare Access, ou un Worker qui lit les dépôts privés et vérifie le jeton du Worker `sopp-agents-auth`). GitHub Pages ne sert pas un dépôt privé sur les offres gratuites.
3. Active le mode serveur (voir `cloudflare-auth/README.md`).

Tant que ces étapes ne sont pas faites, considère le contenu comme public.

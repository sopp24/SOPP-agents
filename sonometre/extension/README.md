# MEUST — Compagnon Deezer (Chrome / Edge)

Le compagnon **MEUST Deezer** relie le panneau musical de MEUST au lecteur Deezer ouvert dans un autre onglet du même navigateur. Il affiche les métadonnées disponibles et pilote la lecture sans passer par un service tiers.

## Installation (Chrome ou Edge)
1. Télécharge le dépôt SOPP Agents ou récupère le dossier `sonometre/extension`.
2. Décompresse-le dans un emplacement permanent.
3. Ouvre `chrome://extensions` (Chrome) ou `edge://extensions` (Edge).
4. Active le **Mode développeur**.
5. Clique sur **Charger l’extension non empaquetée** et sélectionne le dossier `extension`.
6. Ouvre Deezer dans un onglet, connecte-toi et lance une musique.
7. Ouvre [MEUST](https://sopp24.github.io/SOPP-agents/sonometre/), clique sur **Détecter / actualiser**, puis sélectionne l’onglet Deezer.

Après une mise à jour du compagnon, utilise le bouton d’actualisation de la page Extensions si le navigateur ne recharge pas automatiquement le service worker.

## Commandes et informations
- Lecture / pause et piste précédente / suivante.
- Progression de lecture et déplacement dans la piste, lorsque le lecteur l’expose.
- Volume du média lorsque le lecteur expose un élément audio / vidéo ou un curseur de volume accessible.
- Titre, artiste, album, pochette, durée et état de lecture lorsque ces informations sont disponibles.
- Sélection entre plusieurs onglets Deezer, avec priorité à l’onglet actif lors de la première détection.
- Reconnexion et actualisation de l’état lorsque MEUST revient au premier plan.

## Permissions et confidentialité
Le compagnon demande les permissions `tabs` et `scripting`, ainsi que l’accès aux domaines Deezer et à la page MEUST. Il ne lit pas l’historique de navigation, ne collecte aucune donnée et ne communique avec aucun serveur tiers. Les messages restent entre MEUST, le service worker de l’extension et l’onglet Deezer choisi.

Les commandes sont injectées uniquement à la demande dans un onglet Deezer sélectionné. Le canal interne conserve ses identifiants historiques SOPP dB pour rester compatible avec les versions précédentes de MEUST.

## Limites
Deezer ne fournit pas d’API publique stable de contrôle de lecture. Le compagnon utilise donc les fonctions exposées par le lecteur lorsqu’elles sont disponibles, puis les contrôles visibles de la page. Si Deezer modifie son lecteur, certaines commandes peuvent nécessiter une adaptation. Le compagnon ne contrôle pas un téléphone, une enceinte ou un appareil distant, et ne contourne aucun abonnement.

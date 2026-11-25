# SOPP dB — Sonomètre web

Application web progressive intégrée à SOPP Agents, conçue pour mesurer le niveau sonore depuis le navigateur.

## Accès
- Application : https://sopp24.github.io/SOPP-agents/sonometre/
- Bibliothèque : https://sopp24.github.io/SOPP-agents/

## Fonctions
- Mesure du son ambiant depuis un microphone autorisé par le navigateur.
- Sélection du microphone lorsqu'il y en a plusieurs.
- Capture de l'audio d'un onglet via le sélecteur natif du navigateur (si le navigateur le permet).
- Affichage du niveau numérique dBFS avant étalonnage.
- Estimation dB(A) après étalonnage manuel avec une référence acoustique.
- Voyants vert / jaune / rouge : <80 dB, 80–84,9 dB, ≥85 dB.
- Statistiques min / moyenne / crête, chronomètre, graphique et export CSV.
- Fonctionnement PWA et cache des fichiers de l'interface.

## Précision
L'application utilise Web Audio API et applique une pondération fréquentielle A au spectre analysé. Le navigateur ne connaît toutefois pas la sensibilité acoustique du microphone. Le niveau dB(A) reste donc une estimation après étalonnage par l'utilisateur. Il dépend du microphone, de son traitement interne, du placement, du navigateur et de l'environnement. Ce n'est pas un sonomètre certifié et il ne doit pas être utilisé pour des mesures réglementaires ou médicales.

Pour étalonner : démarre une mesure, place l'ordinateur à côté d'un sonomètre de référence, saisis le niveau de référence affiché par cet appareil, puis lance l'étalonnage de cinq secondes.

## Audio et confidentialité
Aucun enregistrement audio n'est créé et aucun flux n'est envoyé à un serveur. Le flux est analysé localement en temps réel et les pistes sont arrêtées à la fin de la mesure. Seul le réglage d'étalonnage du microphone est conservé localement dans le navigateur. L'export CSV contient les niveaux calculés, les horodatages et la source déclarée.

## Source onglet
Le navigateur demande à l'utilisateur de choisir le partage. Il ne permet pas à cette page de scanner automatiquement tous les onglets ouverts ni de lire de façon fiable le titre d'un onglet non choisi.


## Mini-télécommande Deezer (facultative)
Le panneau Deezer permet de choisir un onglet Deezer du même navigateur, d'afficher les métadonnées disponibles (titre, artiste, pochette et progression) et de demander lecture / pause / piste précédente / suivante / déplacement dans la piste.

Pour cela, installe le compagnon Chrome ou Edge situé dans `extension/` :
1. Télécharge et décompresse le compagnon.
2. Ouvre `chrome://extensions` ou `edge://extensions`.
3. Active le mode développeur, puis « Charger l'extension non empaquetée ».
4. Sélectionne le dossier `extension`.
5. Ouvre Deezer, lance une piste, puis recharge SOPP dB et clique sur « Connecter / actualiser ».

Le compagnon utilise les permissions `tabs` et `scripting` pour rechercher les onglets Deezer et interagir avec leurs contrôles visibles. Les métadonnées et commandes sont traitées localement. Deezer ne propose pas d'API publique de contrôle de lecture ; l'intégration repose donc sur les éléments accessibles de l'interface et peut nécessiter une adaptation si Deezer la modifie. Elle ne pilote aucun autre appareil et ne contourne aucun abonnement.

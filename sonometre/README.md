# MEUST — Sonomètre acoustique

**MEUST** est le sonomètre web de SOPP Agents. Son identité fait référence à la trompe d’Eustache : un conduit qui relie l’oreille moyenne au nasopharynx et équilibre les pressions. Le symbole reprend cette idée de conduit anatomique stylisé, associé à une onde sonore.

## Accès
- Application : https://sopp24.github.io/SOPP-agents/sonometre/
- Bibliothèque : https://sopp24.github.io/SOPP-agents/

## Fonctions
- Mesure du son ambiant depuis un microphone autorisé par le navigateur.
- Sélection du microphone lorsqu’il y en a plusieurs.
- Capture de l’audio d’un onglet via le sélecteur natif du navigateur (si le navigateur le permet).
- Affichage du niveau numérique dBFS avant étalonnage.
- Estimation dB(A) après étalonnage manuel avec une référence acoustique.
- Voyants vert / jaune / rouge : <80 dB, 80–84,9 dB, ≥85 dB.
- Statistiques min / moyenne / crête, chronomètre, graphique et export CSV.
- Fonctionnement PWA et cache versionné des fichiers de l’interface.
- Compagnon Deezer facultatif pour afficher les métadonnées, piloter lecture / pause, piste précédente / suivante, progression et volume du lecteur dans un autre onglet du même navigateur.

## Précision
L’application utilise Web Audio API et applique une pondération fréquentielle A au spectre analysé. Les coefficients de pondération sont précalculés pour éviter de refaire les mêmes calculs à chaque rafraîchissement. Le navigateur ne connaît toutefois pas la sensibilité acoustique du microphone. Le niveau dB(A) reste donc une estimation après étalonnage par l’utilisateur. Il dépend du microphone, de son traitement interne, du placement, du navigateur et de l’environnement. Ce n’est pas un sonomètre certifié et il ne doit pas être utilisé pour des mesures réglementaires ou médicales.

Pour étalonner : démarre une mesure, place l’ordinateur à côté d’un sonomètre de référence, saisis le niveau de référence affiché par cet appareil, puis lance l’étalonnage de cinq secondes. Les anciens étalonnages SOPP dB sont migrés localement vers la nouvelle clé MEUST au premier lancement.

## Audio et confidentialité
Aucun enregistrement audio n’est créé et aucun flux n’est envoyé à un serveur. Le flux est analysé localement en temps réel et les pistes sont arrêtées à la fin de la mesure. Seul le réglage d’étalonnage du microphone est conservé localement dans le navigateur. L’export CSV contient les niveaux calculés, les horodatages et la source déclarée.

## Compagnon Deezer (facultatif)
Le panneau **Compagnon Deezer** permet de choisir un onglet Deezer du même navigateur, d’afficher le titre, l’artiste, l’album, la pochette, la progression et le volume, puis d’envoyer les commandes lecture / pause / précédente / suivante / déplacement dans la piste / volume.

Pour cela, installe le compagnon Chrome ou Edge situé dans `extension/` :
1. Télécharge et décompresse le dossier `sonometre/extension` dans un emplacement permanent.
2. Ouvre `chrome://extensions` ou `edge://extensions`.
3. Active le mode développeur, puis « Charger l’extension non empaquetée ».
4. Sélectionne le dossier `extension`.
5. Ouvre Deezer, lance une piste, puis recharge MEUST et clique sur « Détecter / actualiser ».

Le compagnon ne fonctionne que sur l’onglet Deezer que tu sélectionnes. Les commandes sont exécutées localement dans la page Deezer ; aucune bibliothèque personnelle n’est extraite et aucun serveur tiers n’est contacté. Deezer ne propose pas d’API publique stable de contrôle de lecture : l’intégration utilise d’abord les interfaces du lecteur exposées dans la page, puis des contrôles DOM accessibles, et peut nécessiter une adaptation si Deezer modifie son site. Le compagnon ne pilote aucun autre appareil et ne contourne aucun abonnement.

Le canal de messagerie interne conserve volontairement ses anciens identifiants techniques SOPP dB afin de rester compatible avec les installations précédentes du compagnon.

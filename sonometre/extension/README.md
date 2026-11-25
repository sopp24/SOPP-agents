# SOPP dB — Compagnon Deezer (Chrome / Edge)

Cette extension facultative relie le mini-contrôleur Deezer intégré à SOPP dB au lecteur ouvert dans un autre onglet du même navigateur.

## Installation manuelle (Chrome ou Edge)
1. Télécharge l'archive du compagnon depuis le dépôt SOPP Agents ou récupère le dossier `sonometre/extension`.
2. Décompresse l'archive dans un dossier permanent.
3. Ouvre `chrome://extensions` (Chrome) ou `edge://extensions` (Edge).
4. Active le **Mode développeur**.
5. Clique sur **Charger l'extension non empaquetée** et sélectionne le dossier `extension` décompressé.
6. Ouvre Deezer dans un onglet, connecte-toi et lance une musique.
7. Ouvre SOPP dB, clique sur **Connecter / actualiser**, puis sélectionne l'onglet Deezer à contrôler.

## Commandes
- Lecture / pause
- Piste précédente / suivante
- Affichage du titre, artiste et pochette quand Deezer expose ces informations
- Progression et déplacement dans la piste lorsque la barre du lecteur est accessible

## Permissions et vie privée
L'extension demande `tabs` et `scripting`, et l'accès aux domaines Deezer et à la page SOPP dB. Elle ne lit aucun historique de navigation, ne collecte pas de données et ne communique avec aucun serveur tiers. Les messages restent entre la page SOPP dB, le service worker de l'extension et l'onglet Deezer choisi.

Les commandes sont injectées uniquement à la demande dans un onglet Deezer sélectionné. Les sélecteurs de boutons du lecteur peuvent évoluer : si Deezer modifie son interface, une commande peut ne plus fonctionner jusqu'à adaptation du compagnon.

## Limites
Deezer ne fournit plus de lecteur public ni d'API publique de contrôle de lecture. Ce compagnon agit donc sur les contrôles visibles du site Deezer dans le navigateur. Il ne contrôle pas un téléphone, une enceinte, ni un appareil distant. Il ne contourne pas les abonnements ou restrictions Deezer.

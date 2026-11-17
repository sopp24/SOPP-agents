# PEPPER — Travel Companion

PEPPER est le compagnon de voyage de SOPP Agents. Il est responsive, installable en PWA et hébergé sur GitHub Pages. Aucun serveur applicatif, Cloudflare Worker, token GitHub ou clé API n'est utilisé.

## Fonctions

- Carnets de voyage : dates, destination, voyageurs, budget et devise.
- Hébergement : adresse, type de logement, arrivée/départ, contact, accès, équipements, parking, petit-déjeuner, consignes et lien de réservation.
- Transports : plusieurs trajets aller, retour et correspondances en train, avion, voiture, bus ou ferry ; transporteur, numéro, gares/aéroports, terminaux/voies, horaires, bagages, marge d'arrivée et lien du billet.
- Conseils d'arrivée contextualisés selon le mode et le transporteur, avec sources et date de vérification à reprendre lors de chaque voyage.
- Alertes de cohérence entre horaires de transport, activités et check-in / check-out.
- Carte OpenStreetMap avec destination, hébergement et activités.
- Prévisions météo Open-Meteo.
- Activités avec fiche détaillée et case « faite ».
- Budget, dépenses, checklist, export ICS et JSON.
- Données de voyage sauvegardées localement dans le navigateur.

## PIMI et mise à jour via ChatGPT

PEPPER n'embarque pas un agent IA exécuté dans la page. PIMI est piloté depuis la conversation ChatGPT : donne-lui ici une idée d'activité, les informations d'un billet, les détails d'hébergement ou un changement de statut. PIMI peut vérifier les informations sur le web, poser les questions nécessaires et mettre à jour les fichiers du projet GitHub via l'intégration GitHub connectée.

Dans l'application, « Préparer ma demande » copie un contexte expurgé des codes de réservation et numéros de téléphone. Colle-le dans la conversation ChatGPT.

## Pourquoi les cases « faite » ne créent-elles pas un commit ?

GitHub Pages sert des fichiers statiques. Le navigateur n'a pas de droit d'écriture sur le dépôt et ne doit pas recevoir un token GitHub personnel. Les cases « faite » sont donc enregistrées dans le stockage local de l'appareil. Pour demander une modification de code ou une mise à jour du projet, indique-la dans cette conversation : ChatGPT peut directement modifier les fichiers GitHub. La synchronisation automatique entre appareils demanderait un service d'authentification sécurisé, volontairement exclu de cette version.

## Confidentialité

Le dépôt SOPP Agents est public. Les détails du voyage restent dans localStorage, pas dans un fichier JSON public. Ne publie jamais dans GitHub un QR code, billet complet, pièce d'identité, numéro de réservation, code d'accès au logement ou coordonnées personnelles. Les exports JSON peuvent contenir des données privées : garde-les hors des dépôts publics.

## Repères de transport intégrés

- TGV INOUI : SNCF Connect recommande 20 minutes avant le départ ; l'accès peut fermer 2 minutes avant.
- OUIGO : présentation 30 minutes avant ; accès non garanti à moins de 5 minutes du départ.
- Eurostar vers Londres : repère d'une heure avant selon les gares ; les contrôles frontaliers et heures limites doivent être confirmés sur le billet.
- Air France : sans heure différente indiquée sur la carte d'embarquement, repère de 2 heures pour France / Europe et 3 heures pour international. Ce repère ne s'applique pas automatiquement aux autres compagnies.
- Voiture : la Sécurité routière recommande une pause au moins toutes les deux heures et dès les premiers signes de fatigue ; partir reposé et vérifier le véhicule.

Sources :
- SNCF : https://www.sncf-connect.com/aide/presentation-a-l-embarquement
- OUIGO / SNCF : https://www.sncf-connect.com/tgv
- Eurostar : https://www.sncf-connect.com/aide/voyager-avec-eurostar
- Air France : https://wwws.airfrance.fr/information/aeroport/enregistrement
- Sécurité routière : https://www.securite-routiere.gouv.fr/dangers-de-la-route/la-fatigue-et-la-conduite

## Données et déploiement

Les données de voyage sont stockées localement sur l'appareil. Le workflow GitHub Pages de SOPP-agents publie le dossier pepper/.

URL : https://sopp24.github.io/SOPP-agents/pepper/

Le bouton de retour partagé utilise sopp-home-float.js et le paramètre ?from=sopp-agents.

Dépendances : Leaflet, OpenStreetMap / Nominatim, Open-Meteo. Aucun secret n'est inclus dans les fichiers statiques.
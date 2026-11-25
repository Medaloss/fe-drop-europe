# FE DROP EUROPE

Suivi indépendant des RTX 5090/5080/5070 Founders Edition dans 12 pays européens. Ressources dédiées ; aucune dépendance à pearl-research.

## État — 25 novembre 2026

Site publié : https://fe-drop-europe.pages.dev — service séparé `fe-drop-europe-monitor`. 19 tests locaux réussis. Rendus bureau et mobile, filtres pays/carte vérifiés dans Chrome. Les 12 flux ont réellement répondu depuis Cloudflare et restent connectés après correction du délai d’ouverture. Deux contrôles successifs ont trouvé 19 puis 35 stocks frais sur 36 ; les autres étaient inconnus. La source signale `source_degraded`. Cela ne garantit aucun stock.

Relais Google Apps Script déployé et autorisé par le propriétaire. Trois confirmations réelles ont été envoyées ; leur présence dans les messages envoyés et la réception dans la boîte du propriétaire ont été vérifiées. Chaque destinataire doit ouvrir son lien et confirmer dans les 24 heures. Aucun vrai drop par e-mail ne peut encore être attesté. Telegram non implémenté. Le flux ne fournit pas les prix ; l’appel ponctuel au catalogue NVIDIA a expiré après 20 secondes. Aucun tarif n’est inventé.

## Sources et limites

- [Protocole public Notify-FE](https://github.com/jlplenio/notify-fe) : WebSocket documenté sans clé, Origin `https://notify-fe.plen.io`. Implémentation originale, aucun code amont copié. Pas de licence de réutilisation de code constatée. L’accès documenté ne constitue ni SLA ni autorisation de charge illimitée.
- [Couverture](https://github.com/jlplenio/notify-fe/blob/main/src/lib/realtime/catalog.ts) : France, Allemagne, Autriche, Espagne, Italie, Pays-Bas, Royaume-Uni, Danemark, Finlande, Suède, Norvège, Pologne. EUR/GBP/DKK/SEK/NOK/PLN. Les autres pays ne sont pas annoncés comme couverts. Marché surveillé ne signifie pas livraison transfrontalière garantie.
- [Cadence Notify-FE](https://notify-fe.plen.io/) annoncée : 10 secondes, santé environ 30 secondes. La page lit notre service toutes les 10 secondes lorsqu’elle est visible ; le serveur reçoit les événements en continu. Une reconnexion peut perdre des événements non rejoués.
- [Conditions NVIDIA](https://www.nvidia.com/en-eu/about-nvidia/terms-of-service/), section 3.2 : restrictions d’accès automatisé et de charge. Pas de polling NVIDIA direct ni de contournement activé. Vérifier prix, taxes, livraison et stock dans la boutique.

## Architecture

Pages sert `public/` et relaie `/api/*` via la liaison `MONITOR` vers le Worker distinct `fe-drop-europe-monitor`. Celui-ci utilise un unique Durable Object SQLite avec douze connexions partagées, snapshots en mémoire et historique/inscriptions persistants. Alarme de maintenance toutes les 30 secondes, démarrage au premier appel `/api/status`.

Historique : 30 jours / 500 événements maximum. Déduplication persistante : 24 h. Snapshots silencieux ; données synthétiques rejetées ; observation périmée après 60 s : inconnu. Les événements explicites et frais seuls déclenchent une alerte.

E-mails réservés aux adresses invitées. Confirmation valable 24 h, usage unique, désinscription avec suppression. Aucune adresse collectée avant configuration. Les nouvelles préférences ne remplacent une inscription confirmée qu’après confirmation. File persistante, clé d’idempotence par événement/destinataire, maximum 5 essais sur 10 minutes. La livraison exactement une fois jusque dans la boîte mail n’est pas garantie.

## Budget zéro visé

[Workers Free](https://developers.cloudflare.com/workers/platform/limits/) : 100 000 requêtes/jour partagées par le compte. Quatre visiteurs permanents à 10 s : environ 34 560 lectures/jour.

[Durable Objects Free](https://developers.cloudflare.com/durable-objects/platform/pricing/) : 13 000 Go-s/jour. Un singleton actif en permanence consomme environ 11 060 Go-s/jour à 128 Mo. Marge limitée, partagée avec les autres objets. Dépassement gratuit : interruption. Sur compte payant, dépassements potentiellement facturés : vérifier avant déploiement. Ne pas modifier les réglages globaux qui affecteraient PEARL.

[Resend](https://resend.com/pricing) : offre gratuite, 100 e-mails/jour. Plafonds applicatifs conservateurs : 90 tentatives/jour, 2800/mois. Vérifier aussi le quota mensuel de l’offre choisie et garder les dépassements payants désactivés. Un domaine expéditeur autorisé est nécessaire pour plusieurs destinataires ; un achat de domaine pourrait coûter de l’argent et n’est pas autorisé implicitement. Aucun coût engagé.

## Déploiement et exploitation

Les étapes de publication 1–6 ci-dessous ont été réalisées. Les commits du dépôt déclenchent désormais les déploiements du site et du moniteur. Le relais Gmail est actif ; les confirmations individuelles restent à effectuer. Le code reproductible du relais est dans `scripts/gmail-relay.gs`.

Alternative sans domaine : relais Google Apps Script via `EMAIL_RELAY_URL` et `ALLOWED_EMAILS` configurés dans le Worker. Le relais s’exécute sous le compte Gmail du propriétaire avec MailApp (envoi uniquement) et UrlFetchApp (appel du site). Son URL publique ne reçoit ni adresse ni texte libre : elle reçoit un identifiant aléatoire temporaire ; elle demande le message au domaine fixe du site. Le serveur ne révèle un message que pour cet identifiant vivant, supprimé après l’appel. Déduplication secondaire dans les propriétés du script, verrou de concurrence, reçus conservés trois jours. En cas d’incertitude après un envoi, le relais évite de renvoyer automatiquement le message. Le partage du code reste privé ; seule l’URL d’exécution est appelable. Le choix d’accès public et l’autorisation Google nécessitent la validation du propriétaire.

Gmail personnel : quota Apps Script typique de 100 destinataires par jour partagé avec les autres scripts, sujet aux règles Google. Pas de domaine acheté. Les plafonds du Worker restent 90/jour et 2800/mois. Aucun Gmail OAuth ni aucune clé privée dans le dépôt.

1. Reconnecter Cloudflare dans le navigateur et vérifier compte/plan. Aucun secret dans le chat.
2. Avec Node/npm : `npm install`, puis `npx wrangler login` dans une session de confiance.
3. `npm run deploy:monitor` : Worker et migration SQLite.
4. Créer un projet Pages distinct `fe-drop-europe`, dépôt `Medaloss/fe-drop-europe`, branche `main`, sortie `public`, sans compilation. Ou `npm run deploy:pages` après création du projet. Vérifier la liaison `MONITOR`.
5. Vérifier le domaine attribué ; mettre `PUBLIC_ORIGIN` à jour si différent, puis redéployer.
6. Vérifier `/api/status` et la fraîcheur des 36 lignes depuis Cloudflare. Les sondes locales ne prouvent pas l’accès depuis Cloudflare.
7. Transport actif : secrets `EMAIL_RELAY_URL` et `ALLOWED_EMAILS` dans le Worker. Alternative Resend : `RESEND_API_KEY`, `EMAIL_FROM`, `ALLOWED_EMAILS`. Jamais de secrets ni de destinataires dans le dépôt.
8. Vérifier un vrai cycle inscription/confirmation/désinscription. Le transport peut être testé avec un message explicitement TEST, hors historique. Ne pas fabriquer un drop. Une alerte de stock réelle ne sera attestée qu’à réception d’un vrai événement.

## Tests

`node --test tests/*.test.mjs` : tests sans dépendance. Fixtures unitaires et transport factice isolés de `public/`, jamais injectés en production, aucun e-mail envoyé.

`npm run preview` : front-end local ; `/api/*` indique explicitement que Cloudflare n’est pas encore déployé. Pas de faux stocks.

Vérifications distantes effectuées : publication Pages/Worker, données réelles des 12 flux, filtres, rendu mobile, envoi des trois confirmations et réception chez le propriétaire. Les tests locaux couvrent confirmation à usage unique, désinscription, déduplication et protection du relais. La réception chez les deux autres destinataires et un véritable drop restent à confirmer. Aucun faux drop injecté.

# FE DROP EUROPE

Suivi indépendant des RTX 5090/5080/5070 Founders Edition dans 12 pays européens. Ressources dédiées ; aucune dépendance à pearl-research.

## État — 25 novembre 2026

Interface et service écrits. 16 tests locaux réussis. Rendu bureau vérifié dans Chrome. Les 12 flux ont réellement répondu avec les trois modèles, `synthetic: false`, mais `source_degraded`. Cela ne garantit aucun stock.

Pas encore déployé : reconnexion Cloudflare nécessaire. `fe-drop-europe.pages.dev` est une cible non vérifiée. E-mails implémentés mais non configurés et non testés en livraison réelle. Telegram non implémenté. Le flux ne fournit pas les prix ; l’appel ponctuel au catalogue NVIDIA a expiré après 20 secondes. Aucun tarif n’est inventé.

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

## Déploiement restant

1. Reconnecter Cloudflare dans le navigateur et vérifier compte/plan. Aucun secret dans le chat.
2. Avec Node/npm : `npm install`, puis `npx wrangler login` dans une session de confiance.
3. `npm run deploy:monitor` : Worker et migration SQLite.
4. Créer un projet Pages distinct `fe-drop-europe`, dépôt `Medaloss/fe-drop-europe`, branche `main`, sortie `public`, sans compilation. Ou `npm run deploy:pages` après création du projet. Vérifier la liaison `MONITOR`.
5. Vérifier le domaine attribué ; mettre `PUBLIC_ORIGIN` à jour si différent, puis redéployer.
6. Vérifier `/api/status` et la fraîcheur des 36 lignes depuis Cloudflare. Les sondes locales ne prouvent pas l’accès depuis Cloudflare.
7. Configurer uniquement dans les secrets du Worker : `RESEND_API_KEY`, `EMAIL_FROM`, `ALLOWED_EMAILS` (adresses invitées séparées par virgules). Jamais dans le dépôt ou le chat.
8. Vérifier un vrai cycle inscription/confirmation/désinscription. Le transport peut être testé avec un message explicitement TEST, hors historique. Ne pas fabriquer un drop. Une alerte de stock réelle ne sera attestée qu’à réception d’un vrai événement.

## Tests

`node --test tests/*.test.mjs` : tests sans dépendance. Fixtures unitaires et transport factice isolés de `public/`, jamais injectés en production, aucun e-mail envoyé.

`npm run preview` : front-end local ; `/api/*` indique explicitement que Cloudflare n’est pas encore déployé. Pas de faux stocks.

Avant livraison complète : migration et alarmes Cloudflare, données réelles, filtres, rendu mobile et livraison réelle des e-mails restent à vérifier. Les tests locaux ne valident pas ces intégrations distantes.

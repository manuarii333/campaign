# Contexte Projet — HCS Tahiti / Andromeda Campaign Builder
> À lire en priorité pour reprendre le travail

## Résumé du projet
Outil de création de campagnes Facebook Ads pour **HCS Tahiti** (High Coffee Shirt — impression textile DTF, Polynésie française). Tout fonctionne en local, sans backend, sauf le paiement PayZen.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `andromeda-campaign.html` | App principale — Campaign Builder complet (interface, éditeur, export) |
| `payzen-worker.js` | Cloudflare Worker à déployer — génère le formToken PayZen/Lyra |
| `payzen-block.html` | Bloc paiement à coller dans une LP exportée |
| `payzen-form.html` | Page de paiement autonome (standalone) |

---

## Architecture

### andromeda-campaign.html
- **App 100% front-end**, aucun serveur nécessaire pour l'UI
- 8 campagnes Facebook Ads préconfigurées dans le tableau `CAMPS[]`
- Sidebar de navigation + workspace avec 2 colonnes : vignette FB + éditeur
- Fonctionnalités : upload image de fond, logo draggable, thèmes rapides (swatches), changement de format (1:1 / paysage / story)
- Export LP (`exportLP`) et export complet vignette+LP (`exportAd`) → téléchargement HTML
- Intégration PayZen optionnelle dans l'export (si montant + URL worker renseignés)

### Les 8 campagnes (CAMPS[])
| id | Nom | Type lp |
|---|---|---|
| 0 | Sticker Auto | product |
| 1 | T-Shirt Classic Mars | product |
| 2 | Casquette Mars | product |
| 3 | DTF Originals Sports | logos |
| 4 | Grille DTF 3×3 Collector | grid |
| 5 | Formation Textile | training |
| 6 | New Year Abonnements | subscription |
| 7 | Graphiques / Vecto IA | service |

### Paiement PayZen / Lyra / OSB Polynésie
- **API REST** : `https://api.secure.osb.pf/api-payment/V4/Charge/CreatePayment`
- **SDK client** : `https://static.osb.pf/static/js/krypton-client/V4.0/stable/kr-payment-form.min.js`
- **Shop ID** : `41545085`
- **Clé publique TEST** : `41545085:testpublickey_HJw0fXMbbvOAzJuN1BXImXIu5U16qkSHv2eQVjSu0YftA`
- **Worker déployé** : `https://payzen-hcs.highcoffeeshirt.workers.dev/payzen-token`
- **Worker secret** : `hcs-payzen-2026`
- Auth Basic : `shopId:apiKey` encodé base64
- Variables Cloudflare à configurer : `PAYZEN_SHOP_ID`, `PAYZEN_TEST_KEY`, `PAYZEN_PROD_KEY`, `WORKER_SECRET`
- ⚠️ Utiliser les clés REST (onglet "Clés d'API REST"), pas les clés V1/V2

### payzen-form.html (standalone)
- Page de paiement autonome avec résumé commande, champ email, formulaire Lyra
- Paramètres URL supportés : `?amount=3000&product=Casquette&qty=2`
- Appelle le worker pour obtenir le formToken, charge dynamiquement le SDK

---

## Devises
- Tout en **XPF (Franc Pacifique)** — devise entière (pas de centimes)
- Montants typiques : 1 500 – 35 000 XPF

---

## État actuel
- Le builder est fonctionnel
- La page de paiement standalone (`payzen-form.html`) est complète
- Le worker Cloudflare (`payzen-worker.js`) est prêt à déployer
- Les exports HTML fonctionnent

---

## Points d'attention
- Le bloc paiement dans l'export (`exportAd`) utilise `KR.setFormConfig` tandis que la page standalone (`payzen-form.html`) utilise `KR.setFormToken` — les deux approches sont valides selon la version du SDK
- `payzen-block.html` est un snippet à coller manuellement, pas utilisé dans l'export automatique
- Les images uploadées sont embarquées en base64 dans les exports HTML

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

## Comment tester l'application

### 1. Lancer le Campaign Builder (`andromeda-campaign.html`)
- Ouvre `andromeda-campaign.html` directement dans un navigateur (double-clic ou `File > Open`)
- **Aucun serveur nécessaire** — fonctionne en local pur
- Tu dois voir l'interface Andromeda avec la sidebar (8 campagnes) et le workspace

#### Tester les fonctionnalités
| Action | Comment |
|---|---|
| Changer de campagne | Cliquer sur un item dans la sidebar gauche |
| Modifier le titre/sous-titre | Éditer dans le panneau droit → le preview se met à jour en temps réel |
| Changer le fond | Cliquer sur la vignette ou le bouton "Charger image de fond" |
| Changer le thème couleur | Cliquer sur une des 3 pastilles en bas de la vignette |
| Changer le format | Boutons 1:1 / Paysage / Story au-dessus de la vignette |
| Ajouter un logo | Bouton "Charger logo" → le logo apparaît en bas à droite de la vignette, draggable |
| Exporter | Bouton "Exporter LP" (landing page seule) ou "Exporter tout" (vignette + LP) |
| Export global | Bouton "Exporter tout" dans le header — génère les 8 landing pages en téléchargement |

#### Tester l'export HTML
1. Saisir une URL de destination dans le champ "URL de destination"
2. Cliquer "Exporter LP" → un fichier `.html` se télécharge
3. Ouvrir ce fichier dans le navigateur → vérifier que la landing page est correcte

---

### 2. Tester le paiement PayZen (`payzen-form.html`)
- Ouvre `payzen-form.html` dans un navigateur
- Saisir un email valide
- Cliquer "Payer maintenant" → le formulaire de carte bancaire doit s'afficher (SDK OSB chargé)
- **Carte de test** : `4970 1000 0000 0055` — exp `12/25` — CVV `123`
- Le Worker Cloudflare est déjà déployé : `https://payzen-hcs.highcoffeeshirt.workers.dev/payzen-token`
- Le secret worker est : `hcs-payzen-2026`
- Mode actuel : `TEST` (aucune vraie transaction)

#### Test avec paramètres URL
```
payzen-form.html?amount=3500&product=T-Shirt%20Mars&qty=2
```

---

### 3. Tester l'export avec paiement intégré
Dans le Campaign Builder :
1. Sélectionner une campagne (ex: Sticker Auto)
2. Dans l'éditeur, remplir :
   - **Montant** : `2500`
   - **URL Worker** : `https://payzen-hcs.highcoffeeshirt.workers.dev/payzen-token`
   - **Secret Worker** : `hcs-payzen-2026`
   - **Mode** : `TEST`
3. Cliquer "Exporter tout"
4. Ouvrir le fichier exporté → scroller en bas → le formulaire de paiement doit apparaître

---

### 4. Vérifier le Worker Cloudflare (`payzen-worker.js`)
Test depuis un terminal :
```bash
curl -X POST https://payzen-hcs.highcoffeeshirt.workers.dev/payzen-token \
  -H "Content-Type: application/json" \
  -H "X-Worker-Secret: hcs-payzen-2026" \
  -d '{"amount":2500,"currency":"XPF","orderId":"TEST-001","mode":"TEST"}'
```
Réponse attendue : `{"formToken":"...","publicKey":"41545085:TEST"}`

---

## Points d'attention
- Le bloc paiement dans l'export (`exportAd`) utilise `KR.setFormConfig` tandis que la page standalone (`payzen-form.html`) utilise `KR.setFormToken` — les deux approches sont valides selon la version du SDK
- `payzen-block.html` est un snippet à coller manuellement, pas utilisé dans l'export automatique
- Les images uploadées sont embarquées en base64 dans les exports HTML

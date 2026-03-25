# HCS Payment Widget

Widget paiement clé en main — OSB Polynésie / PayZen

## Fichiers

| Fichier | Rôle |
|---------|------|
| `hcs-payment-widget.js` | Source du widget (à modifier ici) |
| `widget-test.html` | Application de test locale |

## URL de production

```
https://payzen-hcs.highcoffeeshirt.workers.dev/widget.js
```

## Intégration rapide

```html
<div id="hcs-pay"
  data-amount="2500"
  data-product="Mon produit"
  data-mode="PRODUCTION"
  data-color="#4facfe"
  data-shop="HCS Tahiti">
</div>
<script src="https://payzen-hcs.highcoffeeshirt.workers.dev/widget.js"></script>
```

## Paramètres

| Attribut | Description |
|----------|-------------|
| `data-amount` | Montant fixe en XPF |
| `data-product` | Nom du produit |
| `data-products` | JSON array `[{name,price,description?}]` |
| `data-free-amount` | `"true"` → saisie libre |
| `data-min` / `data-max` | Limites montant libre |
| `data-mode` | `TEST` ou `PRODUCTION` |
| `data-color` | Couleur principale (hex) |
| `data-label` | Texte du bouton |
| `data-shop` | Nom boutique affiché dans le checkout |

## Déploiement

Après modification de `hcs-payment-widget.js` :

```bash
cp hcs-payment-widget.js ../public/widget.js
cd ..
npx wrangler deploy
```

## Cartes de test

| Résultat | Numéro | Expiration | CVV |
|----------|--------|------------|-----|
| ✅ Accepté | `4970 1000 0000 0055` | 12/26 | 123 |
| ❌ Refusé | `4970 1000 0000 0015` | 12/26 | 123 |
| 🔐 3DS | `4970 1000 0000 0063` | 12/26 | 123 |

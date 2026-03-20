/**
 * Cloudflare Worker — PayZen/Lyra Token Generator
 * À déployer sur Cloudflare Workers
 *
 * Variables à définir dans Cloudflare → Settings → Variables and Secrets :
 *   PAYZEN_SHOP_ID  = 41545085
 *   PAYZEN_TEST_KEY = testpassword_xxxx...   (ne pas écrire ici — mettre dans Cloudflare)
 *   PAYZEN_PROD_KEY = prodpassword_xxxx...  (ne pas écrire ici — mettre dans Cloudflare)
 *   WORKER_SECRET   = hcs-payzen-2026
 *
 * ⚠️  Les clés V1/V2 (wFJgK... et kMOBs...) ne fonctionnent PAS ici.
 *     Il faut les clés REST depuis l'onglet "Clés d'API REST".
 */

// URL API REST OSB Polynésie (source : back office onglet "Clés d'API REST")
const PAYZEN_API_URL = 'https://api.secure.osb.pf/api-payment/V4/Charge/CreatePayment';

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // CORS — autoriser vos domaines
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Worker-Secret',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Vérification du secret partagé
  const secret = request.headers.get('X-Worker-Secret');
  if (secret !== WORKER_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Paramètres du paiement
  const { amount, currency = 'XPF', orderId, customerEmail, mode = 'TEST' } = body;

  if (!amount || amount <= 0) {
    return new Response(JSON.stringify({ error: 'Montant invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // Choix clé selon mode TEST/PRODUCTION
  const apiKey = mode === 'PRODUCTION' ? PAYZEN_PROD_KEY : PAYZEN_TEST_KEY;

  // Appel API Lyra pour créer le formToken
  const payload = {
    amount: Math.round(amount),          // En centimes — XPF = devise entière
    currency: currency,                   // XPF = 953
    orderId: orderId || `HCS-${Date.now()}`,
    customer: {
      email: customerEmail || null,
    },
    // Redirection après paiement
    ipnTargetUrl: 'https://votre-site.com/payzen-webhook',
  };

  // Encodage Basic Auth : shopId:apiKey en base64
  const credentials = btoa(`${PAYZEN_SHOP_ID}:${apiKey}`);

  let lyraResponse;
  try {
    lyraResponse = await fetch(PAYZEN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erreur réseau Lyra', detail: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const lyraData = await lyraResponse.json();

  if (lyraData.status !== 'SUCCESS') {
    return new Response(JSON.stringify({
      error: 'Erreur PayZen',
      detail: lyraData.answer?.errorMessage || 'Inconnue',
      code: lyraData.answer?.errorCode
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // Retourner le formToken au front
  return new Response(JSON.stringify({
    formToken: lyraData.answer.formToken,
    publicKey: `${PAYZEN_SHOP_ID}:${mode === 'PRODUCTION' ? 'PROD' : 'TEST'}`,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

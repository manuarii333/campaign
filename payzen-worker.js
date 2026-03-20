/**
 * Cloudflare Worker — PayZen/Lyra Token Generator + Orders KV
 *
 * Variables Cloudflare → Settings → Variables and Secrets :
 *   PAYZEN_SHOP_ID       = 41545085
 *   PAYZEN_TEST_KEY      = testpassword_xxxx...
 *   PAYZEN_PROD_KEY      = prodpassword_xxxx...
 *   WORKER_SECRET        = hcs-payzen-2026
 *   ADMIN_SECRET         = hcs-admin-2026
 *   PAYZEN_PUBLIC_TEST_KEY
 *   PAYZEN_PUBLIC_PROD_KEY
 *
 * KV Namespace: HCS_ORDERS (binding)
 */

const PAYZEN_API_URL = 'https://api.secure.osb.pf/api-payment/V4/Charge/CreatePayment';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Worker-Secret, X-Admin-Secret',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // ─── POST / or POST /payzen-token → create form token ───────────────────
    if (method === 'POST' && (pathname === '/' || pathname === '/payzen-token')) {
      return handleCreateToken(request, env);
    }

    // ─── POST /order/save ────────────────────────────────────────────────────
    if (method === 'POST' && pathname === '/order/save') {
      return handleOrderSave(request, env);
    }

    // ─── GET /order/status?id=HCS-xxx ────────────────────────────────────────
    if (method === 'GET' && pathname === '/order/status') {
      return handleOrderStatus(url, env);
    }

    // ─── GET /admin/orders ───────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/admin/orders') {
      return handleAdminListOrders(request, env);
    }

    // ─── PATCH /admin/order ──────────────────────────────────────────────────
    if (method === 'PATCH' && pathname === '/admin/order') {
      return handleAdminUpdateOrder(request, env);
    }

    // ─── GET /admin/settings ─────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/admin/settings') {
      return handleAdminGetSettings(request, env);
    }

    // ─── POST /admin/settings ────────────────────────────────────────────────
    if (method === 'POST' && pathname === '/admin/settings') {
      return handleAdminSaveSettings(request, env);
    }

    return err('Not found', 404);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Create PayZen formToken
// ─────────────────────────────────────────────────────────────────────────────
async function handleCreateToken(request, env) {
  const secret = request.headers.get('X-Worker-Secret');
  if (secret !== env.WORKER_SECRET) return err('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { amount, currency = 'XPF', orderId, customerEmail, mode = 'TEST' } = body;
  if (!amount || amount <= 0) return err('Montant invalide');

  const apiKey = mode === 'PRODUCTION' ? env.PAYZEN_PROD_KEY : env.PAYZEN_TEST_KEY;
  const payload = {
    amount: Math.round(amount),
    currency,
    orderId: orderId || `HCS-${Date.now()}`,
    customer: { email: customerEmail || null },
    ipnTargetUrl: 'https://payzen-hcs.highcoffeeshirt.workers.dev/order/save',
  };

  const credentials = btoa(`${env.PAYZEN_SHOP_ID}:${apiKey}`);

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
  } catch (e) {
    return err(`Erreur réseau Lyra: ${e.message}`, 502);
  }

  const lyraData = await lyraResponse.json();

  if (lyraData.status !== 'SUCCESS') {
    return err(
      `Erreur PayZen: ${lyraData.answer?.errorMessage || 'Inconnue'} (${lyraData.answer?.errorCode})`,
      400
    );
  }

  return json({
    formToken: lyraData.answer.formToken,
    publicKey: mode === 'PRODUCTION' ? env.PAYZEN_PUBLIC_PROD_KEY : env.PAYZEN_PUBLIC_TEST_KEY,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Save order to KV
// ─────────────────────────────────────────────────────────────────────────────
async function handleOrderSave(request, env) {
  const secret = request.headers.get('X-Worker-Secret');
  if (secret !== env.WORKER_SECRET) return err('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const orderId = body.orderId || `HCS-${Date.now()}`;

  const order = {
    orderId,
    createdAt: body.createdAt || new Date().toISOString(),
    status: body.status || 'paid',
    amount: body.amount || 0,
    currency: body.currency || 'XPF',
    campaignName: body.campaignName || '',
    product: body.product || '',
    client: {
      name: body.client?.name || '',
      email: body.client?.email || '',
      phone: body.client?.phone || '',
    },
    delivery: {
      type: body.delivery?.type || 'pickup',
      address: body.delivery?.address || '',
      pickupDate: body.delivery?.pickupDate || '',
      deliveryDelay: body.delivery?.deliveryDelay || 3,
    },
    note: body.note || '',
  };

  await env.HCS_ORDERS.put(orderId, JSON.stringify(order));

  return json({ success: true, orderId });
}

// ─────────────────────────────────────────────────────────────────────────────
// Get public order status
// ─────────────────────────────────────────────────────────────────────────────
async function handleOrderStatus(url, env) {
  const id = url.searchParams.get('id');
  if (!id) return err('Missing id parameter');

  const raw = await env.HCS_ORDERS.get(id);
  if (!raw) return err('Order not found', 404);

  const order = JSON.parse(raw);

  // Return only public fields
  return json({
    orderId: order.orderId,
    status: order.status,
    createdAt: order.createdAt,
    amount: order.amount,
    currency: order.currency,
    product: order.product,
    campaignName: order.campaignName,
    delivery: order.delivery,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: list all orders
// ─────────────────────────────────────────────────────────────────────────────
async function handleAdminListOrders(request, env) {
  if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) {
    return err('Unauthorized', 401);
  }

  const list = await env.HCS_ORDERS.list();
  const orders = [];

  for (const key of list.keys) {
    if (key.name === '__settings__') continue;
    const raw = await env.HCS_ORDERS.get(key.name);
    if (raw) orders.push(JSON.parse(raw));
  }

  // Sort by createdAt desc
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return json({ orders });
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: update order (status, note, pickupDate)
// ─────────────────────────────────────────────────────────────────────────────
async function handleAdminUpdateOrder(request, env) {
  if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) {
    return err('Unauthorized', 401);
  }

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { orderId, status, note, pickupDate } = body;
  if (!orderId) return err('Missing orderId');

  const raw = await env.HCS_ORDERS.get(orderId);
  if (!raw) return err('Order not found', 404);

  const order = JSON.parse(raw);

  if (status !== undefined) order.status = status;
  if (note !== undefined) order.note = note;
  if (pickupDate !== undefined) order.delivery.pickupDate = pickupDate;
  order.updatedAt = new Date().toISOString();

  await env.HCS_ORDERS.put(orderId, JSON.stringify(order));

  return json({ success: true, order });
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: get settings
// ─────────────────────────────────────────────────────────────────────────────
async function handleAdminGetSettings(request, env) {
  if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) {
    return err('Unauthorized', 401);
  }

  const raw = await env.HCS_ORDERS.get('__settings__');
  const settings = raw ? JSON.parse(raw) : getDefaultSettings();

  return json({ settings });
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: save settings
// ─────────────────────────────────────────────────────────────────────────────
async function handleAdminSaveSettings(request, env) {
  if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) {
    return err('Unauthorized', 401);
  }

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  await env.HCS_ORDERS.put('__settings__', JSON.stringify(body));

  return json({ success: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Default settings structure (8 campaigns)
// ─────────────────────────────────────────────────────────────────────────────
function getDefaultSettings() {
  const campaigns = [
    'Andromeda', 'Orion', 'Lyra', 'Vega', 'Sirius', 'Atlas', 'Nova', 'Zenith'
  ];
  return {
    campaigns: campaigns.map(name => ({
      name,
      processingDelayDays: 2,
      deliveryDelayDays: 3,
      pickupAvailable: true,
      pickupHours: '08h00 – 17h00',
    })),
  };
}

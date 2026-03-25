/**
 * Cloudflare Worker — HCS Tahiti PayZen/OSB Polynésie
 * URL déployée : https://payzen-hcs.highcoffeeshirt.workers.dev
 *
 * Variables Cloudflare → Settings → Variables and Secrets :
 *   PAYZEN_SHOP_ID         = 41545085
 *   PAYZEN_TEST_KEY        = testpassword_xxxx...   (clé REST test)
 *   PAYZEN_PROD_KEY        = prodpassword_xxxx...   (clé REST prod)
 *   PAYZEN_PUBLIC_TEST_KEY = 41545085:testpublickey_xxxx...
 *   PAYZEN_PUBLIC_PROD_KEY = 41545085:publickey_xxxx...
 *   WORKER_SECRET          = richesse
 *   ADMIN_SECRET           = (secret admin — à définir)
 *
 * ⚠️  Utiliser les clés REST (onglet "Clés d'API REST" du back office OSB),
 *     pas les clés V1/V2.
 *
 * Routes :
 *   POST /payzen-token       → génère un formToken PayZen
 *   POST /  (alias)          → idem
 *   POST /order/save         → sauvegarde une commande dans KV
 *   GET  /order/status?id=X  → statut public d'une commande
 *   GET  /admin/orders       → liste toutes les commandes (admin)
 *   PATCH /admin/order       → met à jour une commande (admin)
 *   GET  /admin/settings     → récupère la config (admin)
 *   POST /admin/settings     → sauvegarde la config (admin)
 *
 * KV Namespace : HCS_ORDERS (lier dans Cloudflare → Workers → Bindings)
 */

const PAYZEN_API_URL = 'https://api.secure.osb.pf/api-payment/V4/Charge/CreatePayment';

function getCors(request) {
  const origin = request?.headers?.get('Origin') || '';
  // Autoriser file:// (origin null) et toutes les origines HTTPS
  const allowOrigin = (!origin || origin === 'null') ? '*' : origin;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Worker-Secret, X-Admin-Secret',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// Compat : corsHeaders statique utilisé dans les réponses sans accès à request
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Worker-Secret, X-Admin-Secret',
};

function json(data, status = 200, request = null) {
  const headers = request ? getCors(request) : corsHeaders;
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: getCors(request) });
    }

    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (method === 'POST' && (pathname === '/' || pathname === '/payzen-token')) {
      return handleCreateToken(request, env);
    }
    if (method === 'POST' && pathname === '/order/save') {
      return handleOrderSave(request, env);
    }
    if (method === 'GET' && pathname === '/order/status') {
      return handleOrderStatus(url, env);
    }
    if (method === 'GET' && pathname === '/admin/orders') {
      return handleAdminListOrders(request, env);
    }
    if (method === 'PATCH' && pathname === '/admin/order') {
      return handleAdminUpdateOrder(request, env);
    }
    if (method === 'GET' && pathname === '/admin/settings') {
      return handleAdminGetSettings(request, env);
    }
    if (method === 'POST' && pathname === '/admin/settings') {
      return handleAdminSaveSettings(request, env);
    }

    // LP hosting
    if (method === 'POST' && pathname === '/lp/publish') {
      return handleLpPublish(request, env);
    }
    if (method === 'GET' && pathname.startsWith('/lp/')) {
      return handleLpServe(pathname, env);
    }
    if (method === 'GET' && pathname === '/lp') {
      return handleLpList(request, env);
    }
    if (method === 'DELETE' && pathname.startsWith('/lp/')) {
      return handleLpDelete(request, pathname, env);
    }

    // Widget JS public
    if (method === 'GET' && pathname === '/widget.js') {
      return env.ASSETS.fetch(request);
    }

    // Thumbnails & images
    if (method === 'POST' && pathname === '/admin/thumb') {
      return handleThumbSave(request, env);
    }
    if (method === 'GET' && pathname.startsWith('/thumb/')) {
      return handleThumbServe(pathname, env);
    }

    // D1 — admin DB routes
    if (method === 'GET' && pathname === '/admin/db/orders') {
      return handleDbListOrders(request, url, env);
    }
    if (method === 'PATCH' && pathname === '/admin/db/order') {
      return handleDbUpdateOrder(request, env);
    }
    if (method === 'POST' && pathname === '/admin/db/archive') {
      return handleDbArchiveOrder(request, env);
    }
    if (method === 'POST' && pathname === '/admin/db/migrate') {
      return handleDbMigrateFromKV(request, env);
    }

    // ── Multi-marchands (/m/) ──────────────────────────────────
    if (method === 'POST' && pathname === '/m/token') {
      return handleMerchantToken(request, env);
    }
    if (method === 'POST' && pathname === '/m/order/save') {
      return handleMerchantOrderSave(request, env);
    }
    if (method === 'GET' && pathname === '/admin/merchants') {
      return handleAdminListMerchants(request, env);
    }
    if (method === 'POST' && pathname === '/admin/merchants') {
      return handleAdminCreateMerchant(request, env);
    }
    if (method === 'PATCH' && pathname.startsWith('/admin/merchants/')) {
      return handleAdminUpdateMerchant(request, pathname, env);
    }
    if (method === 'DELETE' && pathname.startsWith('/admin/merchants/')) {
      return handleAdminDeleteMerchant(request, pathname, env);
    }
    if (method === 'POST' && pathname === '/admin/merchants/migrate') {
      return handleMerchantsMigrate(request, env);
    }

    return err('Not found', 404);
  },
};

// ─────────────────────────────────────────────────────────
// POST /payzen-token  — génère un formToken OSB
// ─────────────────────────────────────────────────────────
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
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${credentials}` },
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
  }, 200, request);
}

// ─────────────────────────────────────────────────────────
// POST /order/save  — sauvegarde commande dans KV
// ─────────────────────────────────────────────────────────
async function handleOrderSave(request, env) {
  const secret = request.headers.get('X-Worker-Secret');
  if (secret !== env.WORKER_SECRET) return err('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const orderId = body.orderId || `HCS-${Date.now()}`;
  const order = {
    orderId,
    createdAt: body.createdAt || new Date().toISOString(),
    status:       body.status       || 'paid',
    amount:       body.amount       || 0,
    currency:     body.currency     || 'XPF',
    campaignName: body.campaignName || '',
    product:      body.product      || '',
    client: {
      name:  body.client?.name  || '',
      email: body.client?.email || '',
      phone: body.client?.phone || '',
    },
    delivery: {
      type:          body.delivery?.type         || 'pickup',
      address:       body.delivery?.address      || '',
      pickupDate:    body.delivery?.pickupDate   || '',
      deliveryDelay: body.delivery?.deliveryDelay || 3,
    },
    note: body.note || '',
  };

  await env.HCS_ORDERS.put(orderId, JSON.stringify(order));

  // Double écriture dans D1
  try {
    await env.HCS_DB.prepare(
      `INSERT OR REPLACE INTO orders
       (id,created_at,status,amount,currency,campaign_name,product,
        client_name,client_email,client_phone,
        delivery_type,delivery_address,pickup_date,delivery_delay,note,archived)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`
    ).bind(
      order.orderId, order.createdAt, order.status, order.amount, order.currency,
      order.campaignName, order.product,
      order.client.name, order.client.email, order.client.phone,
      order.delivery.type, order.delivery.address,
      order.delivery.pickupDate, order.delivery.deliveryDelay,
      order.note
    ).run();
  } catch(_) { /* non-bloquant si D1 indisponible */ }

  // Notification webhook (Discord / Slack / custom) si configuré
  try {
    const settingsRaw = await env.HCS_ORDERS.get('__settings__');
    const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
    if (settings.notificationWebhook) {
      const deliveryInfo = order.delivery.type === 'pickup'
        ? `Retrait boutique · ${order.delivery.pickupDate || 'date à confirmer'}`
        : `Livraison · ${order.delivery.address || ''}`;
      const msg = `🛍️ **Nouvelle commande HCS** \`${order.orderId}\`\n💰 ${order.amount.toLocaleString()} ${order.currency} · **${order.client.name}** (${order.client.email})\n📦 ${order.product}\n🚚 ${deliveryInfo}`;
      await fetch(settings.notificationWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: msg }),
      });
    }
  } catch(_) { /* non-bloquant */ }

  return json({ success: true, orderId });
}

// ─────────────────────────────────────────────────────────
// GET /order/status?id=HCS-xxx  — suivi public commande
// ─────────────────────────────────────────────────────────
async function handleOrderStatus(url, env) {
  const id = url.searchParams.get('id');
  if (!id) return err('Missing id parameter');

  const raw = await env.HCS_ORDERS.get(id);
  if (!raw) return err('Order not found', 404);

  const order = JSON.parse(raw);
  return json({
    orderId:      order.orderId,
    status:       order.status,
    createdAt:    order.createdAt,
    amount:       order.amount,
    currency:     order.currency,
    product:      order.product,
    campaignName: order.campaignName,
    delivery:     order.delivery,
  });
}

// ─────────────────────────────────────────────────────────
// POST /admin/thumb  — sauvegarde une vignette (base64 JPEG)
// ─────────────────────────────────────────────────────────
async function handleThumbSave(request, env) {
  if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) return err('Unauthorized', 401);
  let body; try { body = await request.json(); } catch { return err('Invalid JSON'); }
  const { slug, dataUrl, campaignName } = body;
  if (!slug || !dataUrl) return err('Missing slug or dataUrl');
  const meta = { slug, campaignName: campaignName || slug, savedAt: new Date().toISOString() };
  await env.HCS_ORDERS.put(`thumb:${slug}`, dataUrl, { metadata: meta });
  return json({ success: true });
}

// ─────────────────────────────────────────────────────────
// GET /thumb/:slug  — sert la vignette
// ─────────────────────────────────────────────────────────
async function handleThumbServe(pathname, env) {
  const slug = pathname.replace('/thumb/', '').split('?')[0];
  const dataUrl = await env.HCS_ORDERS.get(`thumb:${slug}`);
  if (!dataUrl) return new Response('', { status: 404 });
  // dataUrl = "data:image/jpeg;base64,/9j/..."
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ─────────────────────────────────────────────────────────
// GET /admin/orders  — liste toutes les commandes
// ─────────────────────────────────────────────────────────
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
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return json({ orders });
}

// ─────────────────────────────────────────────────────────
// PATCH /admin/order  — met à jour statut/note/date retrait
// ─────────────────────────────────────────────────────────
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
  if (status    !== undefined) order.status = status;
  if (note      !== undefined) order.note = note;
  if (pickupDate !== undefined) order.delivery.pickupDate = pickupDate;
  order.updatedAt = new Date().toISOString();

  await env.HCS_ORDERS.put(orderId, JSON.stringify(order));
  return json({ success: true, order });
}

// ─────────────────────────────────────────────────────────
// GET /admin/settings  — récupère la configuration
// ─────────────────────────────────────────────────────────
async function handleAdminGetSettings(request, env) {
  if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) {
    return err('Unauthorized', 401);
  }

  const raw = await env.HCS_ORDERS.get('__settings__');
  const settings = raw ? JSON.parse(raw) : getDefaultSettings();
  return json({ settings });
}

// ─────────────────────────────────────────────────────────
// POST /admin/settings  — sauvegarde la configuration
// ─────────────────────────────────────────────────────────
async function handleAdminSaveSettings(request, env) {
  if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) {
    return err('Unauthorized', 401);
  }

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  await env.HCS_ORDERS.put('__settings__', JSON.stringify(body));
  return json({ success: true });
}

// ─────────────────────────────────────────────────────────
// Paramètres par défaut
// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// POST /lp/publish  — déploie une LP (HTML) dans KV
// ─────────────────────────────────────────────────────────
async function handleLpPublish(request, env) {
  if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) {
    return err('Unauthorized', 401);
  }

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { slug, html, campaignName } = body;
  if (!slug || !html) return err('Missing slug or html');

  const safeSlug = slug.replace(/[^a-z0-9-]/g, '-').toLowerCase();
  const meta = {
    slug: safeSlug,
    campaignName: campaignName || safeSlug,
    publishedAt: new Date().toISOString(),
    url: `https://payzen-hcs.highcoffeeshirt.workers.dev/lp/${safeSlug}`,
  };

  await env.HCS_ORDERS.put(`lp:${safeSlug}`, html, { metadata: meta });
  return json({ success: true, url: meta.url, slug: safeSlug });
}

// ─────────────────────────────────────────────────────────
// GET /lp/:slug  — sert la LP publiée
// ─────────────────────────────────────────────────────────
async function handleLpServe(pathname, env) {
  const slug = pathname.replace('/lp/', '').split('?')[0];
  if (!slug) return err('Missing slug', 400);

  const html = await env.HCS_ORDERS.get(`lp:${slug}`);
  if (!html) return new Response('<h2 style="font-family:sans-serif;padding:40px">Page introuvable.</h2>', {
    status: 404, headers: { 'Content-Type': 'text/html;charset=UTF-8' }
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'public, max-age=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ─────────────────────────────────────────────────────────
// GET /lp  — liste les LPs publiées (admin)
// ─────────────────────────────────────────────────────────
async function handleLpList(request, env) {
  if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) {
    return err('Unauthorized', 401);
  }

  const list = await env.HCS_ORDERS.list({ prefix: 'lp:' });
  const pages = list.keys.map(k => ({
    slug: k.name.replace('lp:', ''),
    ...( k.metadata || {} ),
  }));
  return json({ pages });
}

// ─────────────────────────────────────────────────────────
// DELETE /lp/:slug  — supprime une LP (admin)
// ─────────────────────────────────────────────────────────
async function handleLpDelete(request, pathname, env) {
  if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) {
    return err('Unauthorized', 401);
  }
  const slug = pathname.replace('/lp/', '');
  await env.HCS_ORDERS.delete(`lp:${slug}`);
  return json({ success: true });
}

// ─────────────────────────────────────────────────────────
// GET /admin/db/orders  — liste depuis D1 avec filtres
// ─────────────────────────────────────────────────────────
function d1ToOrder(r) {
  return {
    orderId:      r.id,
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
    status:       r.status,
    amount:       r.amount,
    currency:     r.currency,
    campaignName: r.campaign_name,
    product:      r.product,
    archived:     r.archived === 1,
    note:         r.note,
    client: { name: r.client_name, email: r.client_email, phone: r.client_phone },
    delivery: {
      type:          r.delivery_type,
      address:       r.delivery_address,
      pickupDate:    r.pickup_date,
      deliveryDelay: r.delivery_delay,
    },
  };
}

async function handleDbListOrders(request, url, env) {
  if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) return err('Unauthorized', 401);
  const status   = url.searchParams.get('status');
  const archived = url.searchParams.get('archived') || '0';
  const date     = url.searchParams.get('date');
  const limit    = parseInt(url.searchParams.get('limit') || '500');

  let sql = 'SELECT * FROM orders WHERE archived=?';
  const params = [archived];
  if (status) { sql += ' AND status=?'; params.push(status); }
  if (date)   { sql += ' AND pickup_date=?'; params.push(date); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(String(limit));

  const { results } = await env.HCS_DB.prepare(sql).bind(...params).all();
  return json({ orders: results.map(d1ToOrder) });
}

// ─────────────────────────────────────────────────────────
// PATCH /admin/db/order  — met à jour statut/note/date
// ─────────────────────────────────────────────────────────
async function handleDbUpdateOrder(request, env) {
  if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) return err('Unauthorized', 401);
  let body; try { body = await request.json(); } catch { return err('Invalid JSON'); }
  const { orderId, status, note, pickupDate } = body;
  if (!orderId) return err('Missing orderId');

  const updates = []; const params = [];
  if (status    !== undefined) { updates.push('status=?');      params.push(status); }
  if (note      !== undefined) { updates.push('note=?');        params.push(note); }
  if (pickupDate !== undefined) { updates.push('pickup_date=?'); params.push(pickupDate); }
  updates.push('updated_at=?'); params.push(new Date().toISOString());
  params.push(orderId);

  await env.HCS_DB.prepare(`UPDATE orders SET ${updates.join(',')} WHERE id=?`).bind(...params).run();

  // Sync KV aussi
  const raw = await env.HCS_ORDERS.get(orderId);
  if (raw) {
    const order = JSON.parse(raw);
    if (status)     order.status = status;
    if (note)       order.note = note;
    if (pickupDate) order.delivery.pickupDate = pickupDate;
    order.updatedAt = new Date().toISOString();
    await env.HCS_ORDERS.put(orderId, JSON.stringify(order));
  }
  return json({ success: true });
}

// ─────────────────────────────────────────────────────────
// POST /admin/db/archive  — archive une commande
// ─────────────────────────────────────────────────────────
async function handleDbArchiveOrder(request, env) {
  if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) return err('Unauthorized', 401);
  let body; try { body = await request.json(); } catch { return err('Invalid JSON'); }
  const { orderId, unarchive } = body;
  if (!orderId) return err('Missing orderId');
  const archived = unarchive ? 0 : 1;
  await env.HCS_DB.prepare('UPDATE orders SET archived=?, updated_at=? WHERE id=?')
    .bind(archived, new Date().toISOString(), orderId).run();

  // Sync KV
  const raw = await env.HCS_ORDERS.get(orderId);
  if (raw) {
    const order = JSON.parse(raw);
    order.archived = !!archived;
    order.updatedAt = new Date().toISOString();
    await env.HCS_ORDERS.put(orderId, JSON.stringify(order));
  }
  return json({ success: true });
}

// ─────────────────────────────────────────────────────────
// POST /admin/db/migrate  — importe les commandes KV → D1
// ─────────────────────────────────────────────────────────
async function handleDbMigrateFromKV(request, env) {
  if (request.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) return err('Unauthorized', 401);
  const list = await env.HCS_ORDERS.list();
  let imported = 0;
  for (const key of list.keys) {
    if (key.name.startsWith('__') || key.name.startsWith('lp:')) continue;
    const raw = await env.HCS_ORDERS.get(key.name);
    if (!raw) continue;
    const o = JSON.parse(raw);
    try {
      await env.HCS_DB.prepare(
        `INSERT OR IGNORE INTO orders
         (id,created_at,status,amount,currency,campaign_name,product,
          client_name,client_email,client_phone,
          delivery_type,delivery_address,pickup_date,delivery_delay,note,archived)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        o.orderId, o.createdAt||'', o.status||'paid', o.amount||0, o.currency||'XPF',
        o.campaignName||'', o.product||'',
        o.client?.name||'', o.client?.email||'', o.client?.phone||'',
        o.delivery?.type||'pickup', o.delivery?.address||'',
        o.delivery?.pickupDate||'', o.delivery?.deliveryDelay||3,
        o.note||'', o.archived?1:0
      ).run();
      imported++;
    } catch(_) {}
  }
  return json({ success: true, imported });
}

// ─────────────────────────────────────────────────────────
function getDefaultSettings() {
  return {
    notificationWebhook: '', // URL Discord/Slack/custom à renseigner
    campaigns: [
      'Sticker Auto', 'T-Shirt Classic Mars', 'Casquette Mars', 'DTF Originals Sports',
      'Grille DTF 3×3 Collector', 'Formation Textile', 'New Year Abonnements', 'Graphiques / Vecto IA'
    ].map(name => ({
      name,
      processingDelayDays: 2,
      deliveryDelayDays:   3,
      pickupAvailable:     true,
      pickupHours:         '08h00 – 17h00',
    })),
  };
}

// ═════════════════════════════════════════════════════════════
// MULTI-MARCHANDS — Chiffrement AES-GCM (Web Crypto)
// ═════════════════════════════════════════════════════════════

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2)
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getMasterKey(env) {
  if (!env.MERCHANT_ENCRYPTION_KEY) throw new Error('MERCHANT_ENCRYPTION_KEY manquant');
  const raw = hexToBytes(env.MERCHANT_ENCRYPTION_KEY);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptKey(plaintext, env) {
  const key = await getMasterKey(env);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return bytesToHex(iv) + ':' + bytesToHex(new Uint8Array(enc));
}

async function decryptKey(encrypted, env) {
  const [ivHex, cipherHex] = encrypted.split(':');
  const key = await getMasterKey(env);
  const dec = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: hexToBytes(ivHex) },
    key,
    hexToBytes(cipherHex)
  );
  return new TextDecoder().decode(dec);
}

function generateMerchantId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return 'mrc_' + btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─────────────────────────────────────────────────────────
// POST /m/token — formToken pour un marchand tiers
// ─────────────────────────────────────────────────────────
async function handleMerchantToken(request, env) {
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { merchantId, amount, currency = 'XPF', orderId, customerEmail, mode = 'TEST' } = body;
  if (!merchantId) return err('merchantId requis');
  if (!amount || amount <= 0) return err('Montant invalide');

  const merchant = await env.HCS_DB
    .prepare('SELECT * FROM merchants WHERE id = ? AND active = 1')
    .bind(merchantId).first();
  if (!merchant) return err('Marchand introuvable', 404);

  let apiKey;
  try {
    apiKey = await decryptKey(mode === 'PRODUCTION' ? merchant.enc_prod_key : merchant.enc_test_key, env);
  } catch { return err('Erreur déchiffrement credentials', 500); }

  const authHeader = 'Basic ' + btoa(merchant.shop_id + ':' + apiKey);
  const payload = {
    amount: Math.round(amount),
    currency,
    orderId: orderId || ('M-' + Date.now()),
    customer: { email: customerEmail || '' },
  };

  const res = await fetch(PAYZEN_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.answer?.formToken)
    return json({ error: data.answer?.errorMessage || 'Erreur OSB' }, 502, request);

  const publicKey = mode === 'PRODUCTION' ? merchant.public_prod_key : merchant.public_test_key;
  return json({ formToken: data.answer.formToken, publicKey }, 200, request);
}

// ─────────────────────────────────────────────────────────
// POST /m/order/save — sauvegarde commande marchand tiers
// ─────────────────────────────────────────────────────────
async function handleMerchantOrderSave(request, env) {
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { merchantId } = body;
  if (!merchantId) return err('merchantId requis');

  const merchant = await env.HCS_DB
    .prepare('SELECT id FROM merchants WHERE id = ? AND active = 1')
    .bind(merchantId).first();
  if (!merchant) return err('Marchand introuvable', 404);

  const o = body;
  const now = new Date().toISOString();
  try {
    await env.HCS_DB.prepare(
      `INSERT OR IGNORE INTO orders
       (id,created_at,status,amount,currency,campaign_name,product,
        client_name,client_email,client_phone,
        delivery_type,delivery_address,pickup_date,delivery_delay,note,archived,merchant_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      o.orderId, now, o.status || 'paid', o.amount || 0, o.currency || 'XPF',
      o.campaignName || merchant.id, o.product || '',
      o.client?.name || '', o.client?.email || '', o.client?.phone || '',
      o.delivery?.type || 'pickup', o.delivery?.address || '',
      o.delivery?.pickupDate || '', o.delivery?.deliveryDelay || 3,
      o.note || '', 0, merchantId
    ).run();
    return json({ success: true, orderId: o.orderId }, 200, request);
  } catch (e) {
    return err('Erreur sauvegarde: ' + e.message, 500);
  }
}

// ─────────────────────────────────────────────────────────
// GET /admin/merchants — liste des marchands
// ─────────────────────────────────────────────────────────
async function handleAdminListMerchants(request, env) {
  const secret = request.headers.get('X-Admin-Secret');
  if (secret !== env.ADMIN_SECRET) return err('Unauthorized', 401);

  const { results } = await env.HCS_DB
    .prepare('SELECT id, name, shop_id, public_test_key, public_prod_key, active, created_at FROM merchants ORDER BY created_at DESC')
    .all();
  return json({ merchants: results || [] }, 200, request);
}

// ─────────────────────────────────────────────────────────
// POST /admin/merchants — créer un marchand
// ─────────────────────────────────────────────────────────
async function handleAdminCreateMerchant(request, env) {
  const secret = request.headers.get('X-Admin-Secret');
  if (secret !== env.ADMIN_SECRET) return err('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { name, shopId, testKey, prodKey, publicTestKey, publicProdKey } = body;
  if (!name || !shopId || !testKey || !prodKey || !publicTestKey || !publicProdKey)
    return err('Champs requis: name, shopId, testKey, prodKey, publicTestKey, publicProdKey');

  let encTestKey, encProdKey;
  try {
    encTestKey = await encryptKey(testKey, env);
    encProdKey = await encryptKey(prodKey, env);
  } catch (e) { return err('Erreur chiffrement: ' + e.message, 500); }

  const id = generateMerchantId();
  const now = new Date().toISOString();

  await env.HCS_DB.prepare(
    `INSERT INTO merchants (id, name, shop_id, enc_test_key, enc_prod_key, public_test_key, public_prod_key, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).bind(id, name, shopId, encTestKey, encProdKey, publicTestKey, publicProdKey, now).run();

  return json({ success: true, merchantId: id }, 201, request);
}

// ─────────────────────────────────────────────────────────
// PATCH /admin/merchants/:id — modifier un marchand
// ─────────────────────────────────────────────────────────
async function handleAdminUpdateMerchant(request, pathname, env) {
  const secret = request.headers.get('X-Admin-Secret');
  if (secret !== env.ADMIN_SECRET) return err('Unauthorized', 401);

  const id = pathname.replace('/admin/merchants/', '');
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const fields = [];
  const values = [];

  if (body.name !== undefined)   { fields.push('name = ?');   values.push(body.name); }
  if (body.active !== undefined) { fields.push('active = ?'); values.push(body.active ? 1 : 0); }
  if (body.testKey)  { fields.push('enc_test_key = ?'); values.push(await encryptKey(body.testKey, env)); }
  if (body.prodKey)  { fields.push('enc_prod_key = ?'); values.push(await encryptKey(body.prodKey, env)); }
  if (body.publicTestKey) { fields.push('public_test_key = ?'); values.push(body.publicTestKey); }
  if (body.publicProdKey) { fields.push('public_prod_key = ?'); values.push(body.publicProdKey); }

  if (!fields.length) return err('Aucun champ à modifier');
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  await env.HCS_DB.prepare(
    `UPDATE merchants SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return json({ success: true }, 200, request);
}

// ─────────────────────────────────────────────────────────
// DELETE /admin/merchants/:id — désactiver un marchand
// ─────────────────────────────────────────────────────────
async function handleAdminDeleteMerchant(request, pathname, env) {
  const secret = request.headers.get('X-Admin-Secret');
  if (secret !== env.ADMIN_SECRET) return err('Unauthorized', 401);

  const id = pathname.replace('/admin/merchants/', '');
  await env.HCS_DB.prepare(
    'UPDATE merchants SET active = 0, updated_at = ? WHERE id = ?'
  ).bind(new Date().toISOString(), id).run();

  return json({ success: true }, 200, request);
}

// ─────────────────────────────────────────────────────────
// POST /admin/merchants/migrate — crée la table merchants
// ─────────────────────────────────────────────────────────
async function handleMerchantsMigrate(request, env) {
  const secret = request.headers.get('X-Admin-Secret');
  if (secret !== env.ADMIN_SECRET) return err('Unauthorized', 401);

  try {
    await env.HCS_DB.prepare(`
      CREATE TABLE IF NOT EXISTS merchants (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        shop_id         TEXT NOT NULL,
        enc_test_key    TEXT NOT NULL,
        enc_prod_key    TEXT NOT NULL,
        public_test_key TEXT NOT NULL,
        public_prod_key TEXT NOT NULL,
        active          INTEGER NOT NULL DEFAULT 1,
        created_at      TEXT NOT NULL,
        updated_at      TEXT
      )
    `).run();

    // ALTER TABLE est idempotent avec la vérification d'existence
    try {
      await env.HCS_DB.prepare('ALTER TABLE orders ADD COLUMN merchant_id TEXT DEFAULT NULL').run();
    } catch (_) { /* colonne déjà existante */ }

    return json({ success: true, message: 'Migration OK' }, 200, request);
  } catch (e) {
    return err('Migration échouée: ' + e.message, 500);
  }
}

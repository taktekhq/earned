// earned checkout Worker.
//   POST /checkout        {store, slug, variant, back} -> {url} of a Stripe Checkout Session
//   POST /stripe/webhook  Stripe event; on checkout.session.completed places the Printful order
//   GET  /health
// Prices and Printful variant ids come from the catalogues bundled at deploy time
// (catalog.js), never from the browser.
//
// Env (secrets): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PRINTFUL_TOKEN
// Env (vars):    ALLOWED_ORIGINS (comma list), CONFIRM_ORDERS ("true" sends orders straight to
//                production; anything else leaves them as drafts to approve in Printful),
//                SHIP_COUNTRIES (comma list of ISO codes), NOTIFY_URL (optional Slack-style webhook)
import catalog from './catalog.js';

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

export function findVariant(cat, storeId, slug, variantId) {
  const store = cat[storeId];
  const piece = store?.pieces.find((p) => p.slug === slug);
  const variant = piece?.variants.find((v) => String(v.id) === String(variantId));
  if (!variant) return null;
  const price = variant.price ?? piece.price;
  if (!Number.isInteger(price) || price <= 0) return null;
  return { store, piece, variant, price };
}

function cors(req, env) {
  const origin = req.headers.get('origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' }
    : null;
}

export function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(env, path, params, method = 'POST') {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : form(params).toString(),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`stripe ${path}: ${data.error?.message || r.status}`);
  return data;
}

async function checkout(req, env) {
  const headers = cors(req, env);
  if (!headers) return json({ error: 'origin not allowed' }, 403);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400, headers); }
  const hit = findVariant(catalog, body.store, body.slug, body.variant);
  if (!hit) return json({ error: 'unknown piece' }, 404, headers);
  const { store, piece, variant, price } = hit;
  const back = new URL(`${piece.slug}/`, store.url).href;
  const countries = (env.SHIP_COUNTRIES || 'US,CA,GB,IE,FR,DE,NL,BE,ES,IT,PT,AT,CH,SE,DK,NO,FI,PL,AU,NZ,AE,LB').split(',').map((s) => s.trim());
  const params = {
    mode: 'payment',
    success_url: `${back}?paid=1`,
    cancel_url: back,
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': (store.currency || 'USD').toLowerCase(),
    'line_items[0][price_data][unit_amount]': price,
    'line_items[0][price_data][product_data][name]': `${piece.name}${variant.label ? ` (${variant.label})` : ''}`,
    'line_items[0][price_data][product_data][images][0]': piece.image || undefined,
    'phone_number_collection[enabled]': 'true',
    'metadata[store]': store.id,
    'metadata[slug]': piece.slug,
    'metadata[variant]': String(variant.id),
    'payment_intent_data[metadata][store]': store.id,
    'payment_intent_data[metadata][slug]': piece.slug,
  };
  countries.forEach((c, i) => { params[`shipping_address_collection[allowed_countries][${i}]`] = c; });
  const flat = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined) flat[k] = v;
  const session = await stripe(env, 'checkout/sessions', flat);
  return json({ url: session.url }, 200, headers);
}

// Stripe signs "t.payload" with HMAC-SHA256; header looks like "t=..,v1=..,v1=..".
export async function verifyStripe(payload, header, secret, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')).filter((a) => a.length === 2).map(([k, v]) => [k, v]));
  const sigs = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => s.length === hex.length && timingSafe(s, hex));
}

function timingSafe(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Printful external_id: at most 32 characters, unique per order. Reusing it makes Printful
// refuse a second order for the same payment, so a retried webhook can never order twice.
export const externalId = (sessionId) => sessionId.replace(/[^A-Za-z0-9]/g, '').slice(-32);

export function printfulOrder(session, hit) {
  const ship = session.collected_information?.shipping_details || session.shipping_details || {};
  const addr = ship.address || session.customer_details?.address || {};
  return {
    external_id: externalId(session.id),
    shipping: 'STANDARD',
    recipient: {
      name: ship.name || session.customer_details?.name,
      address1: addr.line1,
      address2: addr.line2 || undefined,
      city: addr.city,
      state_code: addr.state || undefined,
      country_code: addr.country,
      zip: addr.postal_code,
      email: session.customer_details?.email,
      phone: session.customer_details?.phone || undefined,
    },
    items: [{ sync_variant_id: Number(hit.variant.id), quantity: 1, retail_price: (hit.price / 100).toFixed(2) }],
    retail_costs: { currency: (hit.store.currency || 'USD').toUpperCase(), subtotal: (hit.price / 100).toFixed(2), shipping: '0.00', tax: '0.00' },
  };
}

async function webhook(req, env) {
  const payload = await req.text();
  if (!(await verifyStripe(payload, req.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) return json({ error: 'bad signature' }, 400);
  const event = JSON.parse(payload);
  if (event.type !== 'checkout.session.completed') return json({ ignored: event.type });
  const session = event.data.object;
  if (session.payment_status !== 'paid') return json({ ignored: 'unpaid' });
  const m = session.metadata || {};
  const hit = findVariant(catalog, m.store, m.slug, m.variant);
  if (!hit) { await notify(env, `Paid order for an unknown piece: ${JSON.stringify(m)} (${session.id}). Place it by hand.`); return json({ error: 'unknown piece' }); }
  const confirm = env.CONFIRM_ORDERS === 'true';
  const r = await fetch(`https://api.printful.com/orders${confirm ? '?confirm=true' : ''}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.PRINTFUL_TOKEN}`, 'content-type': 'application/json', 'X-PF-Store-Id': String(hit.store.printfulStoreId) },
    body: JSON.stringify(printfulOrder(session, hit)),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    // A duplicate external_id means this payment already has its order: never order twice.
    const dup = /external.?id/i.test(data?.error?.message || data?.result || '');
    if (!dup) await notify(env, `Printful refused the order for ${m.store}/${m.slug} (${session.id}): ${data?.error?.message || r.status}. Place it by hand.`);
    return json({ ok: dup, duplicate: dup }, dup ? 200 : 502);
  }
  await notify(env, `New ${m.store} order: ${hit.piece.name} (${hit.variant.label || hit.variant.id}), ${(hit.price / 100).toFixed(2)} ${hit.store.currency || 'USD'}. Printful #${data.result?.id} ${confirm ? 'sent to production' : 'saved as a draft: confirm it in Printful'}.`);
  return json({ ok: true, printful: data.result?.id });
}

async function notify(env, text) {
  if (!env.NOTIFY_URL) return;
  try { await fetch(env.NOTIFY_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }); } catch {}
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req, env) || {} });
    try {
      if (req.method === 'POST' && url.pathname === '/checkout') return await checkout(req, env);
      if (req.method === 'POST' && url.pathname === '/stripe/webhook') return await webhook(req, env);
      if (url.pathname === '/health') return json({ ok: true, stores: Object.keys(catalog) });
    } catch (err) {
      return json({ error: err.message }, 500, cors(req, env) || {});
    }
    return json({ error: 'not found' }, 404);
  },
};

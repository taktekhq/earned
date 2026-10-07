import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findVariant, verifyStripe, externalId, printfulOrder, form } from '../worker/src/index.js';
import { slimStore } from '../worker/make-catalog.mjs';
import { readFileSync } from 'node:fs';

const store = slimStore(JSON.parse(readFileSync(new URL('../example/store.json', import.meta.url), 'utf8')));
const cat = { example: store };

test('prices come from the catalogue, per-variant overrides win', () => {
  assert.equal(findVariant(cat, 'example', 'lucky-tee', 202).price, 3200);
  assert.equal(findVariant(cat, 'example', 'lucky-tee', '203').price, 3400);
  assert.equal(findVariant(cat, 'example', 'lucky-tee', 999), null);
  assert.equal(findVariant(cat, 'nope', 'lucky-tee', 202), null);
});

async function sign(payload, secret, t) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

test('stripe signatures: good, tampered, stale', async () => {
  const t = 1_800_000_000, body = '{"a":1}', sig = await sign(body, 'whsec_x', t);
  assert.equal(await verifyStripe(body, `t=${t},v1=${sig}`, 'whsec_x', 300, t + 10), true);
  assert.equal(await verifyStripe('{"a":2}', `t=${t},v1=${sig}`, 'whsec_x', 300, t + 10), false);
  assert.equal(await verifyStripe(body, `t=${t},v1=${sig}`, 'whsec_x', 300, t + 1000), false);
  assert.equal(await verifyStripe(body, null, 'whsec_x'), false);
});

test('one payment maps to one Printful external_id of at most 32 chars', () => {
  const id = externalId('cs_live_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6');
  assert.ok(id.length <= 32);
  assert.equal(id, externalId('cs_live_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6'));
});

test('order body carries address and the sync variant', () => {
  const hit = findVariant(cat, 'example', 'lucky-tee', 203);
  const o = printfulOrder({ id: 'cs_test_123', customer_details: { email: 'a@b.c', name: 'A' }, collected_information: { shipping_details: { name: 'A B', address: { line1: '1 Road', city: 'Town', country: 'GB', postal_code: 'AB1' } } } }, hit);
  assert.equal(o.recipient.country_code, 'GB');
  assert.deepEqual(o.items, [{ sync_variant_id: 203, quantity: 1, retail_price: '34.00' }]);
});

test('form encoding nests like Stripe expects', () => {
  assert.equal(form({ a: { b: 1, c: [2] } }).toString(), 'a%5Bb%5D=1&a%5Bc%5D%5B0%5D=2');
});

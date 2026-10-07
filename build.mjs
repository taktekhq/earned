#!/usr/bin/env node
// Build an earned store: node build.mjs SITE_DIR
// Reads SITE_DIR/store.json, writes SITE_DIR/index.html, SITE_DIR/<slug>/index.html and
// copies the runtime into SITE_DIR/_earned/. Static output, ready for any static host.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function validate(store) {
  const errors = [];
  if (!store.id || !/^[a-z0-9-]+$/.test(store.id)) errors.push('store.id must be lowercase letters, digits or dashes');
  if (!store.url) errors.push('store.url (the public URL of the store, ending in /) is required');
  if (!Array.isArray(store.pieces) || !store.pieces.length) errors.push('store.pieces must be a non-empty list');
  const seen = new Set();
  for (const [i, p] of (store.pieces || []).entries()) {
    const at = `pieces[${i}]${p.slug ? ` (${p.slug})` : ''}`;
    if (!p.slug || !/^[a-z0-9-]+$/.test(p.slug)) errors.push(`${at}: slug must be lowercase letters, digits or dashes`);
    if (seen.has(p.slug)) errors.push(`${at}: duplicate slug`);
    seen.add(p.slug);
    if (!p.name) errors.push(`${at}: name is required`);
    if (!p.game) errors.push(`${at}: game is required (a path in the site, or @still/@window/@tomorrow/@stop)`);
    if (!p.challenge) errors.push(`${at}: challenge (one line saying how to unlock it) is required`);
    for (const [j, v] of (p.variants || []).entries()) {
      if (v.id == null) errors.push(`${at}: variants[${j}] needs an id`);
      if (!Number.isInteger(v.price ?? p.price)) errors.push(`${at}: variants[${j}] needs an integer price in cents (or set piece.price)`);
    }
  }
  return errors;
}

// Built-in games are referenced as "@name"; site games by a path relative to the site root.
export function gameSrc(p, depth) {
  const up = '../'.repeat(depth);
  return p.game.startsWith('@') ? `${up}_earned/games/${p.game.slice(1)}.js` : `${up}${p.game}`;
}

function head(store, { title, description, image, url, depth }) {
  const b = store.brand || {};
  const up = '../'.repeat(depth);
  return `<!doctype html>
<html lang="${esc(store.lang || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
${image ? `<meta property="og:image" content="${esc(new URL(image, url).href)}">\n<meta name="twitter:card" content="summary_large_image">` : ''}
${b.favicon ? `<link rel="icon" href="${esc(up + b.favicon)}">` : ''}
${b.fontsHref ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${esc(b.fontsHref)}">` : ''}
<link rel="stylesheet" href="${up}_earned/earned.css">
<style>:root{${b.paper ? `--paper:${b.paper};` : ''}${b.ink ? `--ink:${b.ink};` : ''}${b.accent ? `--accent:${b.accent};` : ''}${b.muted ? `--muted:${b.muted};` : ''}${b.line ? `--rule:${b.line};` : ''}${b.fontDisplay ? `--display:${b.fontDisplay};` : ''}${b.fontMono ? `--mono:${b.fontMono};` : ''}}</style>
${store.headExtra || ''}
</head>`;
}

function storeJson(store, depth) {
  const slim = {
    id: store.id, name: store.name, currency: store.currency || 'USD', checkout: store.checkout || null,
    debug: !!store.debug, brand: store.brand || {},
    pieces: store.pieces.map((p) => ({
      slug: p.slug, name: p.name, price: p.price, gameSrc: gameSrc(p, depth), gameOptions: p.gameOptions || {},
      images: (p.images || []).map((im) => ({ src: '../'.repeat(depth) + im.src, alt: im.alt || '' })),
      variants: p.variants || [],
    })),
  };
  return JSON.stringify(slim).replace(/</g, '\\u003c');
}

function header(store, depth) {
  const up = '../'.repeat(depth) || './';
  return `<header class="top"><a class="brand" href="${up}">${store.brand?.logo ? `<img src="${esc('../'.repeat(depth) + store.brand.logo)}" alt="${esc(store.name)}">` : esc(store.name)}</a>${store.homeLink ? `<a class="home" href="${esc(store.homeLink.href)}">${esc(store.homeLink.label)}</a>` : ''}</header>`;
}

function footer(store) {
  return `<footer class="foot"><p>${store.footer || ''}</p><p class="small">Made to order and shipped by Printful. Built with <a href="https://github.com/taktekhq/earned">earned</a>.</p></footer>`;
}

export function wallHtml(store) {
  const cards = store.pieces.map((p, i) => {
    const img = p.images?.[0];
    return `<li><a class="card" data-card="${esc(p.slug)}" href="${esc(p.slug)}/">
  <span class="ph">${img ? `<img loading="${i < 4 ? 'eager' : 'lazy'}" src="${esc(img.src)}" alt="${esc(img.alt || p.name)}">` : ''}</span>
  <span class="meta"><span class="num">${String(i + 1).padStart(2, '0')}</span><span class="name">${esc(p.name)}</span><span class="challenge">${esc(p.challenge)}</span><span class="state">locked</span></span>
</a></li>`;
  }).join('\n');
  return `${head(store, { title: store.title || store.name, description: store.description || '', image: store.ogImage || store.pieces[0]?.images?.[0]?.src, url: store.url, depth: 0 })}
<body class="wall-page">
${header(store, 0)}
<main class="wall">
  <section class="intro">
    <h1>${esc(store.headline || store.name)}</h1>
    ${store.intro ? `<p class="lede">${store.intro}</p>` : ''}
    <p class="tally" data-tally>0 of ${store.pieces.length} won</p>
  </section>
  <ol class="grid">
${cards}
  </ol>
</main>
${footer(store)}
<script type="application/json" id="earned-store">${storeJson(store, 0)}</script>
<script type="module" src="_earned/earned.js"></script>
</body>
</html>
`;
}

export function pieceHtml(store, p, i) {
  const url = new URL(`${p.slug}/`, store.url).href;
  const img = p.images?.[0];
  const options = p.options || [];
  const selects = options.map((o) => `<label><span>${esc(o.label || o.name)}</span><select data-option="${esc(o.name)}">${o.values.map((v) => `<option>${esc(v)}</option>`).join('')}</select></label>`).join('');
  const prices = (p.variants || []).map((v) => v.price ?? p.price).filter(Number.isInteger);
  const ld = prices.length ? {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.description || p.challenge,
    image: (p.images || []).map((im) => new URL(im.src, store.url).href), brand: { '@type': 'Brand', name: store.brandName || store.name },
    offers: { '@type': 'AggregateOffer', priceCurrency: store.currency || 'USD', lowPrice: (Math.min(...prices) / 100).toFixed(2), highPrice: (Math.max(...prices) / 100).toFixed(2), availability: 'https://schema.org/InStock' },
  } : null;
  return `${head(store, { title: `${p.name} · ${store.name}`, description: `${p.challenge} ${p.description || ''}`.trim(), image: img?.src, url, depth: 1 })}
<body data-slug="${esc(p.slug)}">
${header(store, 1)}
<main class="piece">
  <section class="play">
    <div class="stage" id="stage" aria-live="polite"></div>
    <div class="under"><p class="status" id="status" role="status"></p><button type="button" class="again" id="again">start over</button></div>
  </section>
  <aside class="info">
    <p class="kicker"><a href="../">${esc(store.name)}</a> · ${String(i + 1).padStart(2, '0')} / ${store.pieces.length}</p>
    <h1>${esc(p.name)}</h1>
    ${p.line ? `<p class="line">${esc(p.line)}</p>` : ''}
    ${img ? `<img class="peek" src="../${esc(img.src)}" alt="${esc(img.alt || p.name)}">` : ''}
    <div class="lock" id="lock"><span class="ring" aria-hidden="true"></span><div><strong>Locked.</strong> ${esc(p.challenge)}</div></div>
    <div class="buy" id="buy" hidden>
      <p class="won"><span class="dot" aria-hidden="true"></span><span id="won-line">Won.</span></p>
      <form id="buy-form">
        ${selects}
        <p class="price" id="price"></p>
        <button type="submit">${store.checkout ? 'Buy it' : 'Checkout opens soon'}</button>
        <p class="buy-msg" id="buy-msg" role="status"></p>
      </form>
    </div>
    <p class="paid" id="paid" hidden>Paid. It's being made; a shipping email follows.</p>
    ${p.description ? `<p class="desc">${p.description}</p>` : ''}
    ${p.details?.length ? `<ul class="details">${p.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
  </aside>
</main>
${footer(store)}
<script type="application/json" id="earned-store">${storeJson(store, 1)}</script>
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
<script type="module" src="../_earned/earned.js"></script>
</body>
</html>
`;
}

export function build(siteDir) {
  const store = JSON.parse(readFileSync(join(siteDir, 'store.json'), 'utf8'));
  const errors = validate(store);
  if (errors.length) throw new Error(`store.json has problems:\n- ${errors.join('\n- ')}`);
  for (const p of store.pieces) {
    if (!p.game.startsWith('@') && !existsSync(join(siteDir, p.game))) console.warn(`warning: ${p.slug}: game file ${p.game} not found yet`);
  }
  cpSync(join(here, 'engine'), join(siteDir, '_earned'), { recursive: true });
  // GitHub Pages runs Jekyll, which drops folders and files starting with "_" (like _earned/).
  writeFileSync(join(siteDir, '.nojekyll'), '');
  writeFileSync(join(siteDir, 'index.html'), wallHtml(store));
  store.pieces.forEach((p, i) => {
    mkdirSync(join(siteDir, p.slug), { recursive: true });
    writeFileSync(join(siteDir, p.slug, 'index.html'), pieceHtml(store, p, i));
  });
  return store.pieces.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node build.mjs SITE_DIR'); process.exit(2); }
  try { console.log(`built ${build(dir)} pieces into ${dir}`); }
  catch (e) { console.error(e.message); process.exit(1); }
}

// Runtime for an earned store: marks won pieces on the wall, runs a piece's unlock game,
// and turns a win into a Buy button. The store data is embedded by build.mjs.
import { createKit, makeClock } from './kit.js';

const store = JSON.parse(document.getElementById('earned-store').textContent);
const wonKey = (slug) => `earned:${store.id}:won:${slug}`;
const readWon = (slug) => { try { return JSON.parse(localStorage.getItem(wonKey(slug))); } catch { return null; } };
const writeWon = (slug) => { try { localStorage.setItem(wonKey(slug), JSON.stringify({ at: Date.now() })); } catch {} };
const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const money = (cents) => new Intl.NumberFormat(undefined, { style: 'currency', currency: store.currency || 'USD' }).format(cents / 100);

const slug = document.body.dataset.slug;
if (slug) piecePage(store.pieces.find((p) => p.slug === slug));
else wallPage();

function wallPage() {
  let count = 0;
  for (const card of document.querySelectorAll('[data-card]')) {
    const won = readWon(card.dataset.card);
    if (!won) continue;
    count++;
    card.classList.add('is-won');
    const state = card.querySelector('.state');
    if (state) state.textContent = `won ${fmtDate(won.at)}`;
  }
  const tally = document.querySelector('[data-tally]');
  if (tally) tally.textContent = `${count} of ${store.pieces.length} won`;
}

function piecePage(piece) {
  const root = document.querySelector('.piece');
  const stage = document.getElementById('stage');
  const statusEl = document.getElementById('status');
  const again = document.getElementById('again');
  const now = makeClock(store);
  let kit, cleanup;

  async function start() {
    if (kit) kit._teardown();
    if (typeof cleanup === 'function') { try { cleanup(); } catch {} }
    stage.replaceChildren();
    statusEl.textContent = '';
    kit = createKit({ stage, statusEl, piece, store, now, onWin: (msg) => unlock(msg, true) });
    try {
      const mod = await import(new URL(piece.gameSrc, document.baseURI).href);
      cleanup = await mod.default(kit);
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'This game failed to load. Reload the page to try again.';
    }
  }

  function unlock(message, fresh) {
    if (fresh) writeWon(piece.slug);
    const won = readWon(piece.slug);
    root.classList.add('is-won');
    if (fresh) root.classList.add('just-won');
    document.getElementById('won-line').textContent = message || (won ? `You won this on ${fmtDate(won.at)}.` : 'Won.');
    document.getElementById('buy').hidden = false;
    document.getElementById('lock').hidden = true;
    if (fresh) setTimeout(() => document.getElementById('buy').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 900);
    if (!fresh) showGallery();
    else setTimeout(showGallery, 1600);
  }

  function showGallery() {
    if (kit) kit._teardown();
    stage.replaceChildren();
    const imgs = piece.images || [];
    if (!imgs.length) return;
    const big = Object.assign(document.createElement('img'), { src: imgs[0].src, alt: imgs[0].alt || piece.name, className: 'hero' });
    const thumbs = document.createElement('div');
    thumbs.className = 'thumbs';
    imgs.forEach((im, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', im.alt || `Photo ${i + 1}`);
      b.append(Object.assign(document.createElement('img'), { src: im.src, alt: '' }));
      b.onclick = () => { big.src = im.src; big.alt = im.alt || piece.name; };
      thumbs.append(b);
    });
    stage.classList.add('gallery');
    stage.append(big, thumbs);
    statusEl.textContent = '';
  }

  // Variant pickers: one <select> per option (colour, size), resolved to a variant id.
  const form = document.getElementById('buy-form');
  const priceEl = document.getElementById('price');
  const variants = piece.variants || [];
  const pickers = [...form.querySelectorAll('select[data-option]')];
  const current = () => {
    const want = Object.fromEntries(pickers.map((s) => [s.dataset.option, s.value]));
    return variants.find((v) => pickers.every((s) => (v.options || {})[s.dataset.option] === want[s.dataset.option]));
  };
  const refresh = () => {
    const v = current();
    priceEl.textContent = v ? money(v.price ?? piece.price) : 'Not available';
    form.querySelector('button[type=submit]').disabled = !v || !store.checkout;
  };
  pickers.forEach((s) => s.addEventListener('change', refresh));
  refresh();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = current();
    if (!v || !store.checkout) return;
    const btn = form.querySelector('button[type=submit]');
    const msg = document.getElementById('buy-msg');
    btn.disabled = true;
    msg.textContent = 'Opening checkout…';
    try {
      const r = await fetch(store.checkout, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ store: store.id, slug: piece.slug, variant: v.id, back: location.href.split('#')[0] }),
      });
      const data = await r.json();
      if (!r.ok || !data.url) throw new Error(data.error || `HTTP ${r.status}`);
      location.href = data.url;
    } catch (err) {
      msg.textContent = `Checkout didn't open (${err.message}). Try again in a minute.`;
      btn.disabled = false;
    }
  });

  again.addEventListener('click', () => {
    root.classList.remove('is-won', 'just-won');
    stage.classList.remove('gallery');
    document.getElementById('buy').hidden = true;
    document.getElementById('lock').hidden = false;
    start();
  });

  const params = new URLSearchParams(location.search);
  if (params.get('paid') === '1') document.getElementById('paid').hidden = false;
  if (readWon(piece.slug)) unlock(null, false);
  else start();
}

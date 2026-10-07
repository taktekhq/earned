// The toolbox every unlock game gets. A game is an ES module whose default export is
//   mount(kit) -> optional cleanup function
// It draws inside kit.stage and calls kit.win() when the player has earned the piece.
// Everything registered through the kit (listeners, timers, loops) is torn down on reset.

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createKit({ stage, statusEl, piece, store, onWin, now }) {
  const cleanups = [];
  let done = false;

  const el = (tag, attrs = {}, children = [], ns) => {
    const node = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') on(node, k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children)) if (c != null) node.append(c.nodeType ? c : document.createTextNode(c));
    return node;
  };

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
    return fn;
  }

  const memKey = (k) => `earned:${store.id}:${piece.slug}:${k}`;
  const memory = {
    get(k, fallback = null) {
      try { const v = localStorage.getItem(memKey(k)); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(k, v) { try { localStorage.setItem(memKey(k), JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(memKey(k)); } catch {} },
  };

  const kit = {
    stage,
    piece,
    store,
    options: piece.gameOptions || {},
    colors: store.brand,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    memory,
    now,
    el: (tag, attrs, children) => el(tag, attrs, children),
    svg: (tag, attrs, children) => el(tag, attrs, children, SVG_NS),
    on,
    after(ms, fn) { const t = setTimeout(fn, ms); cleanups.push(() => clearTimeout(t)); return t; },
    every(ms, fn) { const t = setInterval(fn, ms); cleanups.push(() => clearInterval(t)); return t; },
    loop(fn) {
      let id, last = performance.now(), stopped = false;
      const tick = (t) => { if (stopped) return; const dt = Math.max(0, Math.min(64, t - last)); /* the first rAF time can precede now() */ last = t; if (fn(dt, t) === false) return; id = requestAnimationFrame(tick); };
      id = requestAnimationFrame(tick);
      const stop = () => { stopped = true; cancelAnimationFrame(id); };
      cleanups.push(stop);
      return stop;
    },
    cleanup(fn) { cleanups.push(fn); },
    status(text) { if (statusEl) statusEl.textContent = text || ''; },
    // Pointer position inside the stage, 0..1 on both axes.
    point(e) {
      const r = stage.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: (p.clientX - r.left) / r.width, y: (p.clientY - r.top) / r.height };
    },
    // Any sign of life from the player: pointer, touch, key, wheel, scroll.
    onActivity(fn) {
      for (const t of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) on(window, t, fn, { passive: true });
      on(window, 'scroll', fn, { passive: true });
    },
    sleep: (ms) => new Promise((r) => kit.after(ms, r)),
    win(message) {
      if (done) return;
      done = true;
      onWin(message);
    },
    get won() { return done; },
  };

  kit._teardown = () => { while (cleanups.length) { try { cleanups.pop()(); } catch {} } };
  return kit;
}

// A clock that honours ?now=ISO only when the store is in debug mode, so time-window
// unlocks can be tested without waiting for Saturday.
export function makeClock(store) {
  let offset = 0;
  if (store.debug) {
    const q = new URLSearchParams(location.search).get('now');
    if (q && !isNaN(Date.parse(q))) offset = Date.parse(q) - Date.now();
  }
  return () => new Date(Date.now() + offset);
}

// @stop: stop a stopwatch on the exact target. options: { target: 1000 (ms), tolerance: 30, label }
export default function mount(kit) {
  const o = kit.options, target = o.target || 1000, tol = o.tolerance || 30;
  const box = kit.el('div', { class: 'g-center' });
  const read = kit.el('p', { class: 'g-big g-mono', text: '0.000' });
  const btn = kit.el('button', { class: 'g-btn solid', text: 'Start' });
  box.append(kit.el('div', {}, [kit.el('p', { class: 'g-mono', text: o.label || `Stop at exactly ${(target / 1000).toFixed(3)} s` }), read, btn]));
  kit.stage.append(box);
  let t0 = null, stop = null;
  btn.onclick = () => {
    if (t0 == null) {
      t0 = performance.now(); btn.textContent = 'Stop';
      stop = kit.loop(() => { read.textContent = ((performance.now() - t0) / 1000).toFixed(3); });
      return;
    }
    stop(); const got = performance.now() - t0; t0 = null;
    read.textContent = (got / 1000).toFixed(3);
    if (Math.abs(got - target) <= tol) { btn.disabled = true; kit.status('Exactly.'); kit.win(); }
    else { btn.textContent = 'Again'; kit.status(got < target ? 'Too early.' : 'Too late.'); }
  };
}

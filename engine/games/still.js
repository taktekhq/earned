// @still: keep completely still for N seconds. Any input starts over.
// options: { seconds: 10, start: "button label", prompt: "text", moved: "text when you move", done: "text" }
export default function mount(kit) {
  const o = kit.options, total = (o.seconds || 10) * 1000;
  const C = 2 * Math.PI * 180;
  const svg = kit.svg('svg', { viewBox: '0 0 1000 1000' });
  const ring = kit.svg('circle', { cx: 500, cy: 470, r: 180, fill: 'none', stroke: kit.colors.accent || '#00a862', 'stroke-width': 18, 'stroke-dasharray': C, 'stroke-dashoffset': C, transform: 'rotate(-90 500 470)', 'stroke-linecap': 'round' });
  const label = kit.svg('text', { x: 500, y: 790, 'text-anchor': 'middle', 'font-size': 44, fill: 'currentColor', 'font-family': 'var(--display)' });
  svg.append(kit.svg('circle', { cx: 500, cy: 470, r: 180, fill: 'none', stroke: 'currentColor', 'stroke-opacity': .12, 'stroke-width': 18 }), ring, label);
  kit.stage.append(svg);
  let since = null;
  const begin = () => { since = performance.now(); label.textContent = o.prompt || "Don't move."; };
  kit.after(600, begin);
  kit.onActivity(() => { if (since && !kit.won) { since = performance.now(); label.textContent = o.moved || 'You moved. Again.'; } });
  kit.loop(() => {
    if (!since) return;
    const p = Math.min(1, (performance.now() - since) / total);
    ring.setAttribute('stroke-dashoffset', C * (1 - p));
    kit.status(`${Math.ceil((total - p * total) / 1000)}s`);
    if (p >= 1) { label.textContent = o.done || 'Done.'; kit.win(); return false; }
  });
}

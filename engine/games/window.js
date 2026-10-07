// @window: opens only at certain local times.
// options: { days: [0..6] (0 = Sunday, default every day), from: "05:00", to: "08:00",
//            closed: "text while shut", open: "text when open", button: "label" }
const mins = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };

export function isOpen(date, { days, from = '00:00', to = '24:00' } = {}) {
  if (days && !days.includes(date.getDay())) return false;
  const t = date.getHours() * 60 + date.getMinutes();
  const a = mins(from), b = mins(to);
  return a <= b ? t >= a && t < b : t >= a || t < b; // windows may wrap midnight
}

export default function mount(kit) {
  const o = kit.options;
  const box = kit.el('div', { class: 'g-center' });
  kit.stage.append(box);
  const draw = () => {
    const open = isOpen(kit.now(), o);
    box.replaceChildren(kit.el('div', {}, [
      kit.el('p', { class: 'g-big', text: open ? (o.open || "It's open.") : (o.closed || 'Not now.') }),
      kit.el('p', { class: 'g-mono', text: kit.now().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' your time' }),
      open ? kit.el('button', { class: 'g-btn solid', text: o.button || 'Take it', onclick: () => kit.win() }) : null,
    ]));
  };
  draw();
  kit.every(15000, draw);
}

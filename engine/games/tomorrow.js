// @tomorrow: ask now, unlock after a night. options: { ask: "button label", wait: "text",
//   ready: "text", hour: 6 (unlocks after this hour on a later calendar day), button }
export function readyAt(askedMs, hour = 6) {
  const d = new Date(askedMs);
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

export default function mount(kit) {
  const o = kit.options;
  const box = kit.el('div', { class: 'g-center' });
  kit.stage.append(box);
  const draw = () => {
    const asked = kit.memory.get('asked');
    if (!asked) {
      box.replaceChildren(kit.el('div', {}, [
        kit.el('p', { class: 'g-big', text: o.prompt || 'Want it?' }),
        kit.el('button', { class: 'g-btn solid', text: o.ask || 'I want it', onclick: () => { kit.memory.set('asked', kit.now().getTime()); draw(); } }),
      ]));
    } else if (kit.now().getTime() < readyAt(asked, o.hour)) {
      box.replaceChildren(kit.el('div', {}, [
        kit.el('p', { class: 'g-big', text: o.wait || 'Sleep on it.' }),
        kit.el('p', { class: 'g-mono', text: 'Come back tomorrow.' }),
      ]));
    } else {
      box.replaceChildren(kit.el('div', {}, [
        kit.el('p', { class: 'g-big', text: o.ready || 'Still want it?' }),
        kit.el('button', { class: 'g-btn solid', text: o.button || 'Yes', onclick: () => kit.win() }),
      ]));
    }
  };
  draw();
}

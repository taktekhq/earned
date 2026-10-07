// A site-specific game: call three coin flips in a row.
export default function mount(kit) {
  let streak = 0;
  const box = kit.el('div', { class: 'g-center' });
  const msg = kit.el('p', { class: 'g-big', text: 'Heads or tails?' });
  const pick = (side) => {
    const flip = Math.random() < 0.5 ? 'heads' : 'tails';
    streak = flip === side ? streak + 1 : 0;
    msg.textContent = `${flip}. ${streak}/3`;
    if (streak === 3) kit.win('Three in a row. It\'s yours.');
  };
  box.append(kit.el('div', {}, [msg,
    kit.el('button', { class: 'g-btn', text: 'Heads', onclick: () => pick('heads') }), ' ',
    kit.el('button', { class: 'g-btn', text: 'Tails', onclick: () => pick('tails') })]));
  kit.stage.append(box);
}

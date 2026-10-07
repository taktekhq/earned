import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOpen } from '../engine/games/window.js';
import { readyAt } from '../engine/games/tomorrow.js';

test('time windows, including ones that wrap midnight', () => {
  const at = (h, m = 0, day = 3) => { const d = new Date(2026, 9, 4 + day, h, m); return d; }; // 4 Oct 2026 is a Sunday
  assert.equal(isOpen(at(6), { from: '05:00', to: '08:00' }), true);
  assert.equal(isOpen(at(8), { from: '05:00', to: '08:00' }), false);
  assert.equal(isOpen(at(2), { from: '01:00', to: '05:00' }), true);
  assert.equal(isOpen(at(23, 30), { from: '23:00', to: '02:00' }), true);
  assert.equal(isOpen(at(1), { from: '23:00', to: '02:00' }), true);
  assert.equal(isOpen(at(12, 0, 6), { days: [0, 6] }), true);   // Saturday
  assert.equal(isOpen(at(12, 0, 2), { days: [0, 6] }), false);  // Tuesday
});

test('tomorrow means after the set hour on the next day', () => {
  const asked = new Date(2026, 9, 7, 23, 50).getTime();
  assert.equal(new Date(readyAt(asked, 6)).toString(), new Date(2026, 9, 8, 6, 0).toString());
});

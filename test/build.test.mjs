import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, validate, gameSrc, esc } from '../build.mjs';

const example = new URL('../example/', import.meta.url).pathname;

test('example store builds a wall and one page per piece', () => {
  const dir = mkdtempSync(join(tmpdir(), 'earned-'));
  cpSync(example, dir, { recursive: true });
  assert.equal(build(dir), 3);
  const wall = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.match(wall, /data-card="patience-mug"/);
  assert.ok(existsSync(join(dir, 'lucky-tee', 'index.html')));
  assert.ok(existsSync(join(dir, '_earned', 'games', 'still.js')));
  const page = readFileSync(join(dir, 'lucky-tee', 'index.html'), 'utf8');
  assert.match(page, /"@type":"Product"/);
  assert.match(page, /"lowPrice":"32.00","highPrice":"34.00"/);
});

test('validate catches missing fields and bad slugs', () => {
  const errs = validate({ id: 'x', url: 'https://x/', pieces: [{ slug: 'Bad Slug', name: 'n', game: '@still' }, { slug: 'ok', name: 'n', game: '@still', challenge: 'c', variants: [{ id: 1 }] }] });
  assert.ok(errs.some((e) => e.includes('slug must be')));
  assert.ok(errs.some((e) => e.includes('challenge')));
  assert.ok(errs.some((e) => e.includes('integer price')));
});

test('game paths resolve for built-ins and site games', () => {
  assert.equal(gameSrc({ game: '@still' }, 1), '../_earned/games/still.js');
  assert.equal(gameSrc({ game: 'games/x.js' }, 0), 'games/x.js');
});

test('escaping', () => assert.equal(esc('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;'));

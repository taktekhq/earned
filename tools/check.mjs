#!/usr/bin/env node
// Load a page in headless Chrome, report console errors and exceptions, optionally run
// scripted steps and take screenshots. For checking games without a person at the screen.
//
//   node tools/check.mjs URL [--shot out.png] [--size 1200x900] [--wait 1500]
//                            [--step 'JS expression' ...] [--shot-each prefix]
//
// Each --step is evaluated in the page (it may return a Promise) after the previous one,
// with --wait ms between steps. --shot-each writes prefix-0.png (after load), prefix-1.png
// (after step 1)... Exit code 1 if the page threw or logged console errors.
// Chrome: $CHROME, else the usual macOS/Linux locations.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const steps = args.flatMap((a, i) => (a === '--step' ? [args[i + 1]] : []));
const [W, H] = opt('--size', '1200x900').split('x').map(Number);
const wait = Number(opt('--wait', 1500));
if (!url) { console.error('usage: node tools/check.mjs URL [--shot out.png] [--step JS]...'); process.exit(2); }

const candidates = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/opt/pw-browsers/chromium'].filter(Boolean);
const chrome = candidates.find((c) => existsSync(c));
if (!chrome) { console.error('Chrome not found; set CHROME=/path/to/chrome'); process.exit(2); }

const port = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), 'earned-check-'));
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, id = 0;
const pending = new Map();
const problems = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
}

async function main() {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!target) await sleep(200);
  }
  if (!target) throw new Error('Chrome did not start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); return; }
    if (d.method === 'Runtime.exceptionThrown') problems.push(`exception: ${d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text}`);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') problems.push(`console.error: ${d.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon\.ico/.test(d.params.entry.url || '')) problems.push(`log: ${d.params.entry.text} ${d.params.entry.url || ''}`);
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 600 });
  await send('Page.navigate', { url });
  await sleep(wait);
  const shot = async (file) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(data, 'base64')); console.log(`shot ${file}`); };
  const each = opt('--shot-each');
  if (each) await shot(`${each}-0.png`);
  for (const [i, s] of steps.entries()) {
    const r = await send('Runtime.evaluate', { expression: s, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) problems.push(`step ${i + 1} threw: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    else if (r.result?.value !== undefined) console.log(`step ${i + 1}: ${JSON.stringify(r.result.value).slice(0, 400)}`);
    await sleep(wait);
    if (each) await shot(`${each}-${i + 1}.png`);
  }
  if (opt('--shot')) await shot(opt('--shot'));
}

main().catch((e) => problems.push(`check failed: ${e.message}`)).finally(() => {
  try { proc.kill(); } catch {}
  if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; }
  else console.log('no errors');
});

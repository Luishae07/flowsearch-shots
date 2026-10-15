// Takes a screenshot of every site in sites.txt that has none yet (or every site, with ALL=1) and sends it to the Flowsearch server.
import { chromium } from 'playwright';
import fs from 'fs';
import { execFileSync } from 'child_process';

const hosts = fs.readFileSync('sites.txt', 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
const base = fs.readFileSync('url.txt', 'utf8').trim();
const key = process.env.SHOTS_KEY;
const name = h => h.replace(/^www\./, '');
const have = new Set((await (await fetch(base + '/have', { headers: { 'X-Key': key } })).text()).split('\n').filter(Boolean));
const todo = hosts.filter(h => process.env.ALL === '1' || !have.has(name(h)));
console.log(`${todo.length} of ${hosts.length} sites to do`);

const browser = await chromium.launch();
let ok = 0, bad = 0;
for (const h of todo) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
  const page = await ctx.newPage();
  try {
    await page.goto('https://' + h + '/', { timeout: 25000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'tmp.png' });
    execFileSync('convert', ['tmp.png', '-resize', '480x300!', 'small.png']);
    execFileSync('cjxl', ['small.png', 'tmp.jxl', '-q', '60', '--quiet']);
    let sent = false;
    for (let i = 0; i < 3 && !sent; i++) {
      const r = await fetch(`${base}/put?host=${encodeURIComponent(name(h))}`, { method: 'POST', headers: { 'X-Key': key }, body: fs.readFileSync('tmp.jxl') });
      sent = r.ok;
    }
    if (!sent) throw new Error('upload failed');
    ok++;
    console.log('ok  ', h);
  } catch (e) {
    bad++;
    console.log('FAIL', h, String(e.message).split('\n')[0]);
  }
  await ctx.close();
}
await browser.close();
console.log(`done: ${ok} ok, ${bad} failed`);

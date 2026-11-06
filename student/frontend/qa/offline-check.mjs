// Every screen offline: shows the designed offline state (or saved records), never the old error card.
import { chromium } from 'playwright';
import { SCREENS } from '../src/nav.js';
const base = process.env.QA_BASE || 'http://localhost:3000';
const login = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'student@college.edu', password: 'student123' }) })).json();
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(([t, u]) => { sessionStorage.setItem('msec-splash-seen', '1'); localStorage.setItem('auth_token', t); localStorage.setItem('auth_user', JSON.stringify(u)); }, [login.token, login.user]);
const page = await ctx.newPage();
await page.goto(base);
await page.getByRole('navigation', { name: 'Primary' }).waitFor();
await ctx.setOffline(true);
const rows = [];
for (const id of Object.keys(SCREENS).filter((s) => !['more', 'admin', 'assistant'].includes(s))) {
  await page.evaluate((s) => window.__msecNav.navigate(s), id);
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => ({
    designed: !!document.querySelector('.offline-state'),
    oldCard: [...document.querySelectorAll('.error-card')].some((e) => e.offsetParent !== null),
    text: document.querySelector('.offline-state h2')?.textContent || '',
  }));
  rows.push(`${id}: ${r.oldCard ? 'OLD CARD' : r.designed ? r.text : 'content (saved data)'}`);
  if (['assignments','profile','notifications','doubts','faculty_mentor','fees'].includes(id)) await page.screenshot({ path: new URL(`./out/offline-${id}.png`, import.meta.url).pathname });
}
console.log(rows.join('\n'));
await browser.close();

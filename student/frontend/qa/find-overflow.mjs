// Lists elements wider than the viewport on given screens. node qa/find-overflow.mjs fees faculty_mentor
import { chromium } from 'playwright';
const base = process.env.QA_BASE || 'http://localhost:3000';
const login = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'student@college.edu', password: 'student123' }) })).json();
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(([t, u]) => { sessionStorage.setItem('msec-splash-seen', '1'); localStorage.setItem('auth_token', t); localStorage.setItem('auth_user', JSON.stringify(u)); }, [login.token, login.user]);
const page = await ctx.newPage();
await page.goto(base);
await page.getByRole('navigation', { name: 'Primary' }).waitFor();
for (const id of process.argv.slice(2)) {
  await page.evaluate((s) => window.__msecNav.navigate(s), id);
  await page.waitForTimeout(1200);
  const wide = await page.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => {
    const r = e.getBoundingClientRect();
    if (r.right <= innerWidth + 1 || r.width === 0) return false;
    // skip descendants of a horizontally scrollable ancestor
    for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return false; }
    return true;
  }).slice(0, 6).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)} w=${Math.round(e.getBoundingClientRect().width)} style="${(e.getAttribute('style') || '').slice(0, 80)}"`));
  console.log(id, wide);
}
await browser.close();

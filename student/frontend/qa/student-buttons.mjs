// Lists staff-looking buttons visible to a student on each screen (they would get 403).
import { chromium } from 'playwright';
import { SCREENS } from '../src/nav.js';
const base = process.env.QA_BASE || 'http://localhost:3000';
const login = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'student@college.edu', password: 'student123' }) })).json();
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([t, u]) => { sessionStorage.setItem('msec-splash-seen', '1'); localStorage.setItem('auth_token', t); localStorage.setItem('auth_user', JSON.stringify(u)); }, [login.token, login.user]);
const page = await ctx.newPage();
await page.goto(base);
await page.getByRole('navigation', { name: 'Primary' }).waitFor();
const STAFF = /\b(add|create|publish|edit|delete|remove|issue|return|grade|evaluate|mark (present|absent|attendance)|upload certificate|respond|reply to doubt|approve|reject|shortlist|toggle|update status|new assignment|admin|assign|record session|save remarks|sold out|available)\b/i;
for (const id of Object.keys(SCREENS).filter((s) => !['more', 'admin', 'assistant'].includes(s))) {
  await page.evaluate((s) => window.__msecNav.navigate(s), id);
  await page.waitForTimeout(1100);
  // open every tab on the screen so hidden panels are checked too
  const tabs = await page.locator('main [role=tab], main .tabs > button, main .auth-tab').all();
  const seen = new Set();
  for (let i = 0; i <= tabs.length; i++) {
    if (i > 0) { await tabs[i - 1].click().catch(() => {}); await page.waitForTimeout(500); }
    for (const t of await page.locator('main button:visible').allTextContents()) if (STAFF.test(t)) seen.add(t.trim().slice(0, 40));
  }
  if (seen.size) console.log(`${id}: ${[...seen].join(' | ')}`);
}
await browser.close();

// Screenshot one screen as a role. node qa/shot.mjs <screen> <email> <password> <width> <out.png>
import { chromium } from 'playwright';
const [id, email, password, width, out] = process.argv.slice(2);
const base = process.env.QA_BASE || 'http://localhost:3000';
const login = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(([t, u]) => { sessionStorage.setItem('msec-splash-seen', '1'); localStorage.setItem('auth_token', t); localStorage.setItem('auth_user', JSON.stringify(u)); }, [login.token, login.user]);
const page = await ctx.newPage();
await page.goto(base);
await page.getByRole('navigation', { name: 'Primary' }).waitFor();
await page.evaluate((s) => window.__msecNav.navigate(s), id);
await page.waitForTimeout(1200);
if (process.env.CLICK) { await page.getByRole('button', { name: new RegExp(process.env.CLICK) }).first().click(); await page.waitForTimeout(900); }
await page.screenshot({ path: out });
await browser.close();

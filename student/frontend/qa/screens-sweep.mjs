// Visits every screen as each role and reports failures: error cards, failed API calls, console errors, overflow.
// Servers must be running. QA_BASE=http://localhost:3000 CHROMIUM_PATH=... node qa/screens-sweep.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { SCREENS } from '../src/nav.js';

const base = process.env.QA_BASE || 'http://localhost:3000';
const out = new URL('./out/sweep/', import.meta.url);
mkdirSync(out, { recursive: true });
const ACCOUNTS = [
  { label: 'student', email: 'student@college.edu', password: 'student123' },
  { label: 'admin', email: 'vinaygk219@gmail.com', password: 'vinay@123' },
];
const ids = Object.keys(SCREENS).filter((id) => id !== 'more').concat('more');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const report = [];

for (const acct of ACCOUNTS) {
  const token = await (await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: acct.email, password: acct.password }),
  })).json();
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(([t, u]) => {
      sessionStorage.setItem('msec-splash-seen', '1');
      localStorage.setItem('auth_token', t);
      localStorage.setItem('auth_user', JSON.stringify(u));
    }, [token.token, token.user]);
    const page = await ctx.newPage();
    let problems = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text().slice(0, 140)}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 140)}`));
    page.on('response', (r) => {
      const u = r.url();
      if ((u.includes('/api/') || u.includes('/assistant-api/')) && r.status() >= 400) problems.push(`HTTP ${r.status()} ${new URL(u).pathname}`);
    });
    await page.goto(base);
    await page.getByRole('navigation', { name: 'Primary' }).waitFor();
    for (const id of ids) {
      problems = [];
      await page.evaluate((s) => window.__msecNav.navigate(s), id);
      await page.waitForTimeout(1100);
      const state = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        errors: [...document.querySelectorAll('[role=alert], .error-card, .empty-state.is-error')].map((e) => e.textContent.trim().slice(0, 120)).filter(Boolean),
        notFound: !!document.body.textContent.includes('Page not found'),
        h1: document.querySelector('h1')?.textContent || '',
      }));
      const issues = [...new Set(problems)];
      if (state.overflow) issues.push('horizontal overflow');
      for (const e of state.errors) issues.push(`shown: ${e}`);
      if (state.notFound && id !== 'admin') issues.push('404 page');
      if (issues.length) report.push(`${acct.label}@${width} ${id}: ${issues.join(' | ')}`);
      await page.screenshot({ path: new URL(`${acct.label}-${width}-${id}.png`, out).pathname });
    }
    await ctx.close();
  }
}
await browser.close();
console.log(report.length ? report.join('\n') : 'no problems found');

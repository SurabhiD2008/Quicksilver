import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';
import { CLEAN_ENV } from './checks/run.ts';

// Captures review screenshots of the production build (run `npm run build`
// first) into the git-ignored test-results/screenshots/, for checking layout
// changes. The published showcase set in media/ is never written here.
// Pass --url <address> to capture a running deployment instead.

const PORT = 3292;
const OUT = 'test-results/screenshots';
const urlFlag = process.argv.indexOf('--url');
const external = urlFlag > -1 ? process.argv[urlFlag + 1] : undefined;
const base = external ?? `http://127.0.0.1:${PORT}`;

interface Shot {
  name: string;
  /** Section index to bring to the top, or 'story-end' / 'bottom'. */
  at: number | 'story-end' | 'bottom' | `selector:${string}`;
}

const DESKTOP: Shot[] = [
  { name: '01-solid-state', at: 0 },
  { name: '02-molten', at: 1 },
  { name: '03-fracture', at: 2 },
  { name: '04-reformation-wordmark', at: 'story-end' },
  { name: '05-epilogue', at: 'selector:.epilogue-heading' },
  { name: '06-what-actually-helps', at: 'selector:.epilogue-subheading' },
  { name: '07-sources', at: 'bottom' },
];
const MOBILE: Shot[] = [
  { name: '08-mobile-solid-state', at: 0 },
  { name: '09-mobile-wordmark', at: 'story-end' },
  { name: '10-mobile-epilogue', at: 'selector:.epilogue-heading' },
];

async function scrollTo(page: Page, at: Shot['at']) {
  await page.evaluate((target) => {
    const sections = document.querySelectorAll<HTMLElement>('main > section');
    let top = 0;
    if (typeof target === 'number') top = sections[target]?.offsetTop ?? 0;
    else if (target === 'bottom') top = document.body.scrollHeight;
    else if (target === 'story-end') {
      const story = sections[3];
      top = story ? story.offsetTop + story.offsetHeight - window.innerHeight : 0;
    } else {
      const el = document.querySelector<HTMLElement>(target.slice('selector:'.length));
      top = el ? el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.18 : 0;
    }
    window.scrollTo({ top, behavior: 'instant' });
  }, at);
  await page.waitForTimeout(2200);
}

async function capture(
  shots: Shot[],
  viewport: { width: number; height: number },
  scale: number,
  mobile: boolean,
) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: scale,
    isMobile: mobile,
    hasTouch: mobile,
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.mouse.move(viewport.width * 0.55, viewport.height * 0.5);
  for (const shot of shots) {
    await scrollTo(page, shot.at);
    await page.screenshot({ path: `${OUT}/${shot.name}.png` });
    console.log(`saved ${OUT}/${shot.name}.png`);
  }
  await browser.close();
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`${base}/`)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('the server did not start; run `npm run build` first');
}

mkdirSync(OUT, { recursive: true });
const server = external
  ? null
  : spawn('npx', ['next', 'start', '-p', String(PORT), '-H', '127.0.0.1'], {
      env: { ...process.env, ...CLEAN_ENV },
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
try {
  await waitForServer();
  await capture(DESKTOP, { width: 1440, height: 900 }, 1, false);
  await capture(MOBILE, { width: 390, height: 844 }, 2, true);
} finally {
  server?.kill();
}

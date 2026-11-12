import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const BASE = 'https://7321ridgeway.com';
export const STATE_DIR = process.env.RIDGEWAY_STATE_DIR || path.join(os.homedir(), '.config', 'ridgeway-bot');
export const STATE_FILE = path.join(STATE_DIR, 'state.json');
const LOCK_FILE = path.join(STATE_DIR, 'run.lock');
const LOCK_STALE_MS = 2 * 60 * 1000;

export class BotError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

// Supabase rotates its refresh token on use, so two runs at once would invalidate each other.
function acquireLock() {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.closeSync(fs.openSync(LOCK_FILE, 'wx', 0o600));
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (Date.now() - fs.statSync(LOCK_FILE).mtimeMs > LOCK_STALE_MS) fs.rmSync(LOCK_FILE, { force: true });
      else throw new BotError('busy', 'another ridgeway run is in progress');
    }
  }
  throw new BotError('busy', 'could not take the run lock');
}

function saveState(state) {
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(tmp, STATE_FILE);
}

// Runs fn(page) in a logged-in browser context, then persists the (rotated) session.
export async function withSession(fn, { requireLogin = true } = {}) {
  if (requireLogin && !fs.existsSync(STATE_FILE)) {
    throw new BotError('needs_login', 'no saved session; run `ridgeway login`');
  }
  acquireLock();
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1000, height: 1200 },
      ...(fs.existsSync(STATE_FILE) ? { storageState: STATE_FILE } : {}),
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    const result = await fn(page, ctx);
    saveState(await ctx.storageState());
    return result;
  } finally {
    await browser.close();
    fs.rmSync(LOCK_FILE, { force: true });
  }
}

export async function gotoMember(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  if (new URL(page.url()).pathname.startsWith('/login')) {
    throw new BotError('needs_login', 'session expired; run `ridgeway login`');
  }
}

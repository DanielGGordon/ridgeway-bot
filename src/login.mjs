import fs from 'node:fs';
import readline from 'node:readline/promises';
import { BASE, BotError, STATE_FILE, withSession } from './session.mjs';

// The members sign-in has no password: Google OAuth or an emailed one-time code. Request the
// code, get it from a file (non-interactive) or the terminal, and save the session.
export async function login(email, codeFile) {
  return withSession(
    async (page) => {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await page.fill('#email', email);
      await page.getByRole('button', { name: 'Email me a sign-in code' }).click();
      await page.locator('#code').waitFor();
      let code;
      if (codeFile) {
        for (let i = 0; i < 300 && !fs.existsSync(codeFile); i++) await page.waitForTimeout(1000);
        if (!fs.existsSync(codeFile)) throw new BotError('login_timeout', `no code appeared in ${codeFile}`);
        code = fs.readFileSync(codeFile, 'utf8').trim();
        fs.rmSync(codeFile, { force: true });
      } else {
        const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
        code = (await rl.question(`Sign-in code emailed to ${email}: `)).trim();
        rl.close();
      }
      await page.locator('#code').fill(code);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => {
        throw new BotError('login_failed', 'the code was not accepted');
      });
      return { loggedIn: true, url: page.url(), stateFile: STATE_FILE };
    },
    { requireLogin: false },
  );
}

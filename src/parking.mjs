import { BotError, gotoMember } from './session.mjs';

const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

// "Blocking Jane Doe (ABC123)\nSince 12:02 PM\n5550100\nI'm leaving"
export function parseBlocking(mainText) {
  const m = mainText.match(/Blocking (.+?) \(([^)]+)\)\s*\nSince ([^\n]+)/);
  return m ? { name: m[1], plate: m[2], since: m[3] } : null;
}

export async function currentBlock(page) {
  return parseBlocking(await page.locator('main').innerText());
}

const reportForm = (page) => page.locator('form').filter({ has: page.getByRole('button', { name: 'Report block' }) });

export async function readSuggestions(page, scope) {
  const items = await scope.locator('ul li button').all();
  const out = [];
  for (const it of items) {
    const lines = (await it.innerText()).split('\n').map((l) => l.trim()).filter(Boolean);
    // plate, "·", name, optional "(guest)", then the vehicle description
    const [plate, , name, ...rest] = lines;
    const guest = rest[0] === '(guest)';
    out.push({ plate, name, guest, vehicle: guest ? rest[1] : rest[0], _el: it });
  }
  return out;
}

async function typeQuery(page, scope, query) {
  const input = scope.getByPlaceholder('Type a plate or name…');
  await input.fill(query);
  // suggestions arrive asynchronously; an empty result simply never renders a list
  await scope.locator('ul li button').first().waitFor({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(400);
}

// Which suggestion does the spoken query mean? Returns { pick } or { ambiguous: [...] }.
export function choose(query, cands) {
  const q = norm(query);
  const exact = cands.filter((c) => norm(c.plate) === q);
  if (exact.length === 1) return { pick: exact[0] };
  if (cands.length === 1) return { pick: cands[0] };
  const names = new Set(cands.map((c) => c.name.toLowerCase()));
  if (names.size === 1) {
    // one person listed twice (member vehicle + a guest sign-in): prefer the member entry
    const members = cands.filter((c) => !c.guest);
    return { pick: members.length === 1 ? members[0] : cands[0] };
  }
  return { ambiguous: cands };
}

const strip = ({ _el, ...c }) => c;

export async function status(page) {
  await gotoMember(page, '/parking');
  return { blocking: await currentBlock(page) };
}

export async function lookup(page, query) {
  await gotoMember(page, '/parking');
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Look up plate' }) });
  await form.getByPlaceholder('Type a plate or name…').fill(query);
  const confirm = page.getByRole('button', { name: 'Yes, look up this plate' });
  await confirm.first().waitFor({ timeout: 4000 }).catch(() => {});
  // This card lists matches beside the form, each as: "plate· name", "In lot", vehicle, button
  const matches = [];
  for (const btn of await confirm.all()) {
    const lines = (await btn.locator('xpath=..').innerText()).split('\n').map((l) => l.trim()).filter(Boolean);
    const [plate, name] = lines[0].split('·').map((t) => t.trim());
    matches.push({ plate, name, vehicle: lines[2] });
  }
  return { matches };
}

export async function leave(page) {
  await gotoMember(page, '/parking');
  const was = await currentBlock(page);
  if (!was) return { cleared: null, note: 'not blocking anyone' };
  await page.getByRole('button', { name: "I'm leaving" }).click();
  await page.waitForFunction(() => !/Blocking .+ \(/.test(document.querySelector('main').innerText));
  return { cleared: was };
}

export async function block(page, query, { dryRun = false } = {}) {
  await gotoMember(page, '/parking');
  let cleared = null;
  const existing = await currentBlock(page);
  if (existing) {
    // The site hides the report form until the previous block is cleared; parking behind
    // someone new means the previous car is gone.
    await page.getByRole('button', { name: 'Continue' }).click();
    await reportForm(page).waitFor();
    cleared = existing;
  }
  const form = reportForm(page);
  await typeQuery(page, form, query);
  const cands = await readSuggestions(page, form);
  if (!cands.length) {
    // Speech-to-text garbles surnames ("Smith" for "Smyth"), so offer the cars matching any one
    // word of the name, but never pick one: the wrong pick would notify the wrong driver.
    const similar = [];
    for (const word of query.split(/\s+/).filter((w) => w.length >= 3)) {
      await typeQuery(page, form, word);
      for (const c of await readSuggestions(page, form)) {
        if (!similar.some((o) => o.plate === c.plate)) similar.push(strip(c));
      }
    }
    throw new BotError('no_match', `no car currently in the lot matches "${query}"`, { similar, cleared });
  }
  const decision = choose(query, cands);
  if (decision.ambiguous) {
    throw new BotError('ambiguous', `"${query}" matches several cars`, { candidates: decision.ambiguous.map(strip), cleared });
  }
  const target = strip(decision.pick);
  if (dryRun) return { dryRun: true, wouldBlock: target, cleared };
  await decision.pick._el.click();
  await form.getByRole('button', { name: 'Report block' }).click();
  const ok = await page
    .waitForFunction(() => /Blocking .+ \(/.test(document.querySelector('main').innerText), null, { timeout: 10000 })
    .then(() => true, () => false);
  if (!ok) {
    const toast = await page.locator('[data-sonner-toast]').allInnerTexts();
    throw new BotError('report_failed', 'the site did not confirm the block', { toast, target, cleared });
  }
  return { blocking: await currentBlock(page), target, cleared };
}

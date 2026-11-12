#!/usr/bin/env node
import { BotError, withSession } from '../src/session.mjs';
import { block, leave, lookup, status } from '../src/parking.mjs';
import { login } from '../src/login.mjs';

const USAGE = `usage:
  ridgeway status                    who am I blocking right now
  ridgeway lookup <plate|name>       cars in the lot matching the query (read-only)
  ridgeway block <plate|name> [--dry-run]
                                     report that I'm blocking that car (clears any previous block first)
  ridgeway leave                     clear my current block ("I'm leaving")
  ridgeway login <email> [--code-file <path>]
                                     request an emailed sign-in code and save the session
Output is one JSON object on stdout; exit code 0 ok, 2 needs attention (ambiguous, no_match, needs_login, ...), 1 unexpected.`;

const args = process.argv.slice(2);
const dryRun = process.argv.includes('--dry-run');
const ci = args.indexOf('--code-file');
const codeFile = ci >= 0 ? args.splice(ci, 2)[1] : undefined;
const pos = args.filter((a) => a !== '--dry-run');
const [cmd, ...rest] = pos;
const query = rest.join(' ').trim();

async function run() {
  switch (cmd) {
    case 'status': return withSession((p) => status(p));
    case 'lookup':
      if (!query) throw new BotError('usage', 'lookup needs a plate or name');
      return withSession((p) => lookup(p, query));
    case 'block':
      if (!query) throw new BotError('usage', 'block needs a plate or name');
      return withSession((p) => block(p, query, { dryRun }));
    case 'leave': return withSession((p) => leave(p));
    case 'login':
      if (!query) throw new BotError('usage', 'login needs an email');
      return login(query, codeFile);
    default: throw new BotError('usage', USAGE);
  }
}

try {
  console.log(JSON.stringify({ ok: true, ...(await run()) }));
} catch (e) {
  const known = e instanceof BotError;
  console.log(JSON.stringify({ ok: false, error: known ? e.code : 'unexpected', message: e.message, ...(known ? e.extra : {}) }));
  process.exit(known ? 2 : 1);
}

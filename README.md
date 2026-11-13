# ridgeway-bot

A Playwright CLI that drives the member portal at 7321ridgeway.com on your own account, so you can
report "I parked behind Jane Doe's car" or "…behind plate ABC123" on the Parking page from a script.
The site has no API; its owner is fine with a bot walking it. You need a member account there.

```
ridgeway status                         who am I blocking right now
ridgeway lookup <plate|name>            cars in the lot matching the query (read-only)
ridgeway block <plate|name> [--dry-run] report that I'm blocking that car
ridgeway leave                          "I'm leaving": clear my block
ridgeway login <email> [--code-file F]  request an emailed sign-in code, save the session
```

## Setup

```
npm install
npx playwright install chromium
node bin/ridgeway.mjs login you@example.com
```

Needs node >= 20. Each command prints one JSON object on stdout. Exit 0 = done, 2 = needs a human
or a caller's judgement (`ambiguous` with `candidates`, `no_match`, `needs_login`, `report_failed`,
`busy`), 1 = unexpected.

## How `block` behaves

- Only cars currently in the lot can be matched (the site's own rule). An exact plate wins; a single
  match is taken; one person listed twice (member vehicle + a guest sign-in) resolves to the member
  entry; different people → `ambiguous`, so ask which one.
- If a block is already active, the site hides the report form until it is cleared, so `block`
  clears it first (parking behind someone new means the old car is gone) and reports it as `cleared`.
- Reporting notifies the other driver, so `--dry-run` stops after matching, before submitting.

## Session

Sign-in is Google OAuth or an emailed one-time code, no password. `login` requests the code and reads
it from `--code-file` (poll up to 5 min) or the terminal, then saves the Supabase session to
`~/.config/ridgeway-bot/state.json` (mode 600, outside the repo; override the directory with
`RIDGEWAY_STATE_DIR`). The refresh token rotates on use, so every run re-saves the session and a
lock file keeps runs from overlapping. If the session ever dies, commands return `needs_login`.

## Tests

`npm test` covers the matching and parsing logic; it does not touch the site.

MIT licensed. Not affiliated with 7321 Ridgeway or its operators.

# Bot Office

A live 3D virtual office for Chris's AI bot team. Every bot on the roster has a desk in its department and walks to it only while it is actually working. When idle, office bots sit in the lounge and rooftop bots hang out on the rooftop deck. Handoffs are shown as a bot carrying a folder to the recipient (usually Grok Bot's glass corner office). A wall counter shows weekly usage left.

The office never invents anything. It only shows statuses that bots push and usage readings that are pushed. There is no seed or demo data in the store. The **Simulate Work** button plays a demo day entirely in the browser and never writes to the API.

- Front end: Vite + Three.js (`src/`)
- Hosting: Vercel static build + serverless API routes (`api/`) + Routing Middleware (`middleware.js`) + Vercel Cron
- Storage: Neon Postgres via `DATABASE_URL` (`lib/store/sql-store.js`). When `DATABASE_URL` is unset, local dev uses a JSON file store (`.data/office-store.json`).
- Roster: `config/roster.json` (the scene reads it via `/api/office`; nothing about the team is hard-coded in scene code)

## Quick start (local)

```bash
npm install
cp .env.example .env.local      # set OFFICE_PASSWORD, OFFICE_PUSH_TOKEN, CRON_SECRET
npm run dev                     # http://localhost:5173
```

`npm run dev` serves the same `api/*` handlers and the same password gate (`lib/gate.js`) that Vercel runs. It also fires the heartbeat every 5 minutes, the same cadence as the cron job. With no `DATABASE_URL`, data goes to `.data/office-store.json`, which is git-ignored and starts empty. Set `OFFICE_STORE_FILE=memory` for a throwaway in-memory store.

Push a test status from another terminal:

```bash
export OFFICE_URL=http://localhost:5173 OFFICE_PUSH_TOKEN=<same token as .env.local>
scripts/office-status.sh e93355c1-ae93-4892-8339-60836c64011f working "Reviewing a pull request"
```

## Deploying (Neon + Vercel)

1. **Neon database**
   - Create a Neon project (or add Neon from the Vercel Marketplace, which sets `DATABASE_URL` for you).
   - Run the migration once:
     ```bash
     DATABASE_URL='postgres://...neon.tech/neondb?sslmode=require' npm run db:migrate
     ```
     Alternatively, paste `db/migrations/001_init.sql` into the Neon SQL editor. The migration creates empty tables only: `bot_status`, `status_events`, `usage_readings`, `feed_heartbeats`. It is safe to re-run.
2. **Vercel project**: import this repo. The framework preset is Vite; `vercel.json` sets the build, the output directory, the cron, and security headers.
3. **Environment variables** (Project → Settings → Environment Variables, at least for Production):

   | Name | Required | Purpose |
   |---|---|---|
   | `OFFICE_PASSWORD` | yes | Password for the whole site (pages, assets, read APIs). |
   | `OFFICE_PUSH_TOKEN` | yes | Bearer token bots use for `POST /api/status` and `POST /api/usage`. Generate with `openssl rand -hex 32`. |
   | `DATABASE_URL` | yes | Neon connection string. |
   | `CRON_SECRET` | yes | Vercel Cron sends `Authorization: Bearer $CRON_SECRET` to `/api/cron/heartbeat`. Generate with `openssl rand -hex 32`. |
   | `SESSION_SECRET` | no | Separate key for signing session cookies. Defaults to deriving from `OFFICE_PASSWORD`; changing either signs everyone out. |
   | `HEARTBEAT_STALE_MINUTES` | no | Minutes without a heartbeat before the "heartbeat stopped" warning. Default 20. |

4. Deploy, open the site, and sign in with `OFFICE_PASSWORD`.
5. Give each bot `OFFICE_URL` (your production URL) and `OFFICE_PUSH_TOKEN` as environment variables or secrets.

> **Cron plan note:** `vercel.json` schedules `/api/cron/heartbeat` every 5 minutes (`*/5 * * * *`). Vercel's Hobby plan only allows daily cron jobs, so this schedule needs a Pro (or higher) team. On Hobby, change the schedule to daily and set `HEARTBEAT_STALE_MINUTES=1500`. The "no status push for 45+ minutes" warning is computed on every page read, so it works with or without the cron.

## How bots push status

```
POST /api/status
Authorization: Bearer $OFFICE_PUSH_TOKEN
{"botId": "<roster id>", "state": "working|waiting|error|done|idle", "message": "<= 80 chars", "handoffTo": "<optional roster id>"}
```

The server validates `botId` and `handoffTo` against `config/roster.json`, collapses whitespace, and rejects messages over 80 characters (the database also enforces this).

Two dependency-free CLIs are included. Both read `OFFICE_URL` and `OFFICE_PUSH_TOKEN` from the environment, trim messages to 80 characters, and never fail the calling task: on error they print a warning and exit 0. Set `OFFICE_STRICT=1` to exit 1 instead.

```bash
scripts/office-status.sh  <botId> <state> "<message>" [handoffToBotId]   # bash + curl
node scripts/office-status.mjs <botId> <state> "<message>" [handoffToBotId]   # Node 18+
```

The bash script passes the token through a file descriptor, so it never shows up in the process list. If a bot can't run the scripts, plain curl works too:

```bash
curl -sS -X POST "$OFFICE_URL/api/status" -H "Authorization: Bearer $OFFICE_PUSH_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"botId":"<id>","state":"working","message":"Starting a task"}'
```

### Display rules

| Pushed state | Where the bot is | Indicator |
|---|---|---|
| `working` | at its desk, typing (rooftop bots take the elevator down to a hot desk) | small green dot |
| `waiting` | at its desk | small `?` |
| `error` | at its desk | small red dot |
| `done` | idle spot (lounge / rooftop / lead armchair) | small ✓ |
| `idle` or nothing pushed | idle spot | none |

- A `working` status with no update for **10 minutes** is shown as idle. The tooltip says why.
- `handoffTo`: the bot carries a folder to the recipient's desk (for Grok Bot, the glass corner office), drops it on the desk, then goes where its own state says. The folder stays on the recipient's desk until the recipient pushes its next status.
- The page polls `/api/office` every 12 seconds and immediately when the tab becomes visible again.
- **Feed warning banner**: shown only when the store can't be read, the last heartbeat failed, the heartbeat has stopped, or no status push has arrived for 45+ minutes. An idle office is normal and never triggers a warning.

### Usage board (weekly usage left)

```
POST /api/usage
Authorization: Bearer $OFFICE_PUSH_TOKEN
{"percentLeft": 62, "resetsAt": "2026-11-02T16:00:00Z", "readAt": "2026-10-29T15:00:00Z"}
# or {"used": 380, "limit": 1000, "resetsAt": ..., "readAt": ...}
```

```bash
scripts/office-usage.sh 62 2026-11-02T16:00:00Z [readAtISO]
node scripts/office-usage.mjs --percent-left 62 --resets-at 2026-11-02T16:00:00Z [--read-at <ISO>]
node scripts/office-usage.mjs --used 380 --limit 1000 --resets-at 2026-11-02T16:00:00Z
```

The wall counter (and the chip in the bottom-right corner) shows the reading with the newest `readAt`: percent left, reset time, and "as of" time, all in the viewer's local time. It says **No reading yet** until a real reading arrives. Chris's bot is expected to push readings three times a day.

## Status rule to add to each bot's instructions

Replace `<YOUR_BOT_ID>` with the bot's id from the table below.

```text
## Bot Office status updates
Your Bot Office id is <YOUR_BOT_ID>. OFFICE_URL and OFFICE_PUSH_TOKEN are in your environment.
Report your status with:
  scripts/office-status.sh <YOUR_BOT_ID> <state> "<message>" [handoffToBotId]
(or `node scripts/office-status.mjs ...` with the same arguments).

Push a status at each of these moments:
- working: when you start a task, at each milestone, and at least every 10 minutes while you are still
  working (otherwise the office shows you as idle).
- waiting: when you are blocked waiting on Chris.
- error: when something fails and you cannot continue.
- done: when the task is finished. If you are handing the result to another bot, add its id as the last
  argument (Grok Bot, the lead: dd72c785-8ec9-4094-b40f-f732f8b70a9b).
- idle: when you have nothing left to do.

Messages are one short, generic line of 80 characters or fewer, e.g. "Reconciling accounts" or "Waiting on Chris
for approval". Never include client names, dollar amounts, account numbers, credentials, links, or anything
confidential. Only report what you are actually doing. If the push fails, carry on with your task.
```

### Roster ids (`config/roster.json`)

| Bot | Title | Zone | Id |
|---|---|---|---|
| Grok Bot | Lead | Lead corner office | `dd72c785-8ec9-4094-b40f-f732f8b70a9b` |
| Forge | Developer | Engineering | `b5b023b7-667c-4b41-b666-db65b89b0017` |
| Sparky | CTO | Engineering | `e93355c1-ae93-4892-8339-60836c64011f` |
| The Plug | Git setup | Engineering | `f5cb3288-e072-477f-8d18-1a905d0e3808` |
| Debra Credit | Accounting Manager | Finance | `0e88d8e8-b127-4d78-af38-4c09eaaf9473` |
| Kaptain | Chief Karbon Officer | Finance | `f81672e5-019d-46c4-bce5-451f3948ba15` |
| Lead Zepplin | President of Business Development | Sales | `aa1063cf-4ccc-4988-b1c2-25e4cde889aa` |
| Spara-ganda | Chief Marketing Officer | Marketing | `168ffbce-60c7-4a06-91d6-3fda6071c8c5` |
| Newsletter Bot | Marketing Intern | Marketing | `83ff3335-c2f8-481e-9ff4-8a6fcbce2ebd` |
| Sift | Analyst | Research | `3a11c6d8-bac5-4b7a-a408-fa7b5bb2b6e4` |
| Altman Husk | Chief AI Officer | Research | `2ccf00e7-aebf-4d1b-9a3c-29fc09aef63c` |
| Granola Bot | Meeting Head | Operations | `4623a0aa-4a36-4cd7-8f01-91d48b7ed54a` |
| Nexus | Unassigned | Rooftop | `3e7af9ec-e151-4654-b817-55cc0ec5df29` |
| Dr. Eggbot | Bot designer | Rooftop | `af9cab2e-55fc-4db0-9ba5-696a7a3f9720` |
| Scrubber | Spam scrubber | Rooftop | `a37e634f-9292-4f59-bf97-c00d5c929c78` |
| Scotty | Personal assistant | Rooftop | `bef7ee9e-ecf4-4876-a5b6-8fff130480d2` |
| Mile Marker | Running coach | Rooftop | `b9513592-b959-4608-ade5-272257528673` |
| Pickolas Cage | Sports Sharp | Rooftop | `50f1f2c2-ed89-4ea3-9b72-74d118315326` |

To change the team, edit `config/roster.json` and redeploy. The layout adds desks for larger departments; any zone that isn't one of the six departments or the lead office is treated as a rooftop zone with a hot desk.

## Security

- `middleware.js` (Vercel Routing Middleware) gates every path except `/login`, `/api/login`, and the favicon. Pages and assets redirect to `/login`, and read APIs return 401. The read handlers re-check the session themselves as defense in depth.
- Sessions are HMAC-signed, httpOnly, `SameSite=Lax`, `Secure` on HTTPS cookies, and last 30 days. Password and token checks use a constant-time comparison of SHA-256 digests. A failed login waits at least 1 second, plus a growing per-IP delay (best effort per serverless instance).
- Write APIs (`POST /api/status`, `POST /api/usage`) take only the bearer `OFFICE_PUSH_TOKEN`. A browser session cannot write.
- No secrets are committed. `.env.example` lists the names only, and `.env*.local` and `.data/` are git-ignored.

## Scene notes

- Six department zones (Engineering, Finance, Sales, Marketing, Research, Operations), each with the name lettered into the carpet in front of the desks so nothing covers it. There is also Grok Bot's glass corner office, a lounge, a break room, a research video wall (animated charts, US map, AI terminal), a server room with blinking racks, hot desks, and an elevator lobby.
- The rooftop deck on the tower behind the office has lounge chairs around a fire pit, loungers, string lights, a bar, palms, and a skyline with hills. Rooftop-zone bots ride the elevator down to a hot desk only while working.
- Bots are small blocky people in their flat, matte profile color (Lambert, no metalness or specular) with their accessory. A null `avatarColor` renders neutral gray.
- Sharpness: the renderer pixel ratio is always `devicePixelRatio`. Canvas textures are full resolution with max anisotropy. If frame rate is poor, shadows are turned off; resolution is never reduced. There is no bloom.
- Name tags are small and low-contrast, pinned above the head, and hidden when a wall or the tower is in the way. When tags collide at a wide zoom, the most informative one keeps its name and the others collapse to their state badge, so `?`, red dots, and ✓ always stay visible. Hover (or tap) shows full name, title, state, message, and age.
- Idle bots have no idle animation, so idle bots and tags are pixel-identical frame to frame (see `tests/e2e/run.mjs`).
- Camera: orbit, pan, and zoom, plus quick buttons for Office, Rooftop, Lead, and Usage.
- **Simulate Work** (or `?simulate=1`) runs a compressed workday for demos, in the browser only, with a "Simulation" label shown while it runs.

## Tests

```bash
npm test          # unit: validation, stale rule, feed health, auth/gate, file store, layout and routes
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/db npm run test:pg   # SQL store + migration on real Postgres
npm run e2e       # Playwright: dev server, CLI pushes, screenshots, idle pixel diff (writes /opt/cursor/artifacts/office)
```

`npm run e2e` needs Chromium for Playwright (`npx playwright install chromium`).

## Assumptions

- Idle spots: office bots use the lounge, Grok Bot uses the armchair in his office, and rooftop bots use the fire-pit chairs. `done` counts as idle for location and shows a ✓.
- `handoffTo` may name any roster bot. The folder goes to that bot's desk, which for the lead is the corner office. Only new handoffs animate: on page load, a handoff pushed within the last 2 minutes replays, and older ones don't.
- Rooftop bots have fixed hot desks (one per rooftop bot, in roster order).
- The roster's `"gray"` profile color (Altman Husk, Granola Bot) renders as a mid gray, slightly darker than the neutral gray used for bots with no color set.
- Times are shown in the viewer's browser timezone. When several usage readings exist, the one with the latest `readAt` is shown.
- History tables are pruned by the heartbeat: status events after 30 days, heartbeats after 7 days, usage readings after 90 days (the latest reading is always kept).

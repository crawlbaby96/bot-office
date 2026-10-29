# Bot Office

A live 3D virtual office for Chris's AI bot team. Every bot on the roster has a desk in its department and walks to it only while it is actually working. When idle, office bots sit in the lounge and rooftop bots hang out on the rooftop deck. Handoffs are shown as a bot carrying a folder to the recipient (usually Grok Bot's glass corner office). Chris's running Cursor cloud agents visit as **contractors** at hot desks in Engineering. A wall board shows Grok Bot's weekly usage left plus Cursor, OpenAI, and Anthropic usage and cost.

The office never invents anything. It only shows statuses that bots push, usage readings that are pushed, and what the providers' official APIs return. A source that isn't configured or whose fetch fails is shown as **Not connected** or **Stale since <time>**, never with placeholder numbers. There is no seed or demo data in the store. The **Simulate Work** button plays a demo day entirely in the browser and never writes to the API.

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

`npm run dev` serves the same `api/*` handlers and the same password gate (`lib/gate.js`) that Vercel runs. It also fires the same crons as Vercel: the heartbeat (which also fetches cloud agents) every 5 minutes and the provider usage fetch hourly, plus once each at startup. With no `DATABASE_URL`, data goes to `.data/office-store.json`, which is git-ignored and starts empty. Set `OFFICE_STORE_FILE=memory` for a throwaway in-memory store.

Push a test status from another terminal:

```bash
export OFFICE_URL=http://localhost:5173 OFFICE_PUSH_TOKEN=<same token as .env.local>
scripts/office-status.sh e93355c1-ae93-4892-8339-60836c64011f working "Reviewing a pull request"
```

## Deploying (Neon + Vercel)

1. **Neon database**
   - Create a Neon project (or add Neon from the Vercel Marketplace, which sets `DATABASE_URL` for you).
   - Migrations run automatically on every Vercel build (`npm run db:migrate && npm run build` in `vercel.json`). `scripts/db-migrate.mjs` applies each file in `db/migrations/` once, in order, and records it in `schema_migrations`; every migration is also written to be safe to re-run. To run them by hand:
     ```bash
     DATABASE_URL='postgres://...neon.tech/neondb?sslmode=require' npm run db:migrate
     ```
   - The migrations create empty tables only: `bot_status`, `status_events`, `usage_readings`, `feed_heartbeats` (`001_init.sql`), `cloud_agent_snapshots` (`002_cloud_agents.sql`), and `provider_usage_readings` (`003_provider_usage.sql`).
2. **Vercel project**: import this repo. The framework preset is Vite; `vercel.json` sets the build, the output directory, the crons, and security headers.
3. **Environment variables** (Project → Settings → Environment Variables, at least for Production):

   | Name | Required | Purpose |
   |---|---|---|
   | `OFFICE_PASSWORD` | yes | Password for the whole site (pages, assets, read APIs). |
   | `OFFICE_PUSH_TOKEN` | yes | Bearer token bots use for `POST /api/status` and `POST /api/usage`. Generate with `openssl rand -hex 32`. |
   | `DATABASE_URL` | yes | Neon connection string. |
   | `CRON_SECRET` | yes | Vercel Cron sends `Authorization: Bearer $CRON_SECRET` to `/api/cron/heartbeat` and `/api/cron/usage`. Generate with `openssl rand -hex 32`. |
   | `SESSION_SECRET` | no | Separate key for signing session cookies. Defaults to deriving from `OFFICE_PASSWORD`; changing either signs everyone out. |
   | `HEARTBEAT_STALE_MINUTES` | no | Minutes without a heartbeat before the "heartbeat stopped" warning. Default 20. |
   | `CURSOR_API_KEY` | no | Cursor **user** API key for the Cloud Agents API (contractors). See [Cloud agents as contractors](#cloud-agents-as-contractors). |
   | `CURSOR_ADMIN_API_KEY` | no | Cursor **Admin API** key (team spend row). Team plan only. See [AI service usage rows](#ai-service-usage-rows). |
   | `OPENAI_ADMIN_KEY` | no | OpenAI organization **Admin** key (OpenAI cost row). |
   | `ANTHROPIC_ADMIN_KEY` | no | Anthropic **Admin API** key (Anthropic cost row). |

   Every provider key is optional: without it, that source shows **Not connected** and nothing is fetched. Keys are only read by the server-side cron and API functions; they are never sent to the browser, logged, or stored. `CURSOR_API_BASE`, `OPENAI_API_BASE`, and `ANTHROPIC_API_BASE` exist only so the e2e run can point at a local mock; leave them unset in Vercel.

4. Deploy, open the site, and sign in with `OFFICE_PASSWORD`.
5. Give each bot `OFFICE_URL` (your production URL) and `OFFICE_PUSH_TOKEN` as environment variables or secrets.

> **Cron plan note:** `vercel.json` schedules `/api/cron/heartbeat` every 5 minutes (`*/5 * * * *`, also fetches cloud agents) and `/api/cron/usage` hourly (`7 * * * *`). Vercel's Hobby plan only allows daily cron jobs, so these schedules need a Pro (or higher) team. On Hobby, change the schedule to daily and set `HEARTBEAT_STALE_MINUTES=1500`. The "no status push for 45+ minutes" warning is computed on every page read, so it works with or without the cron.

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
| `waiting` | walks to Chris's exec office and queues at the door | **Needs Chris** pill, `?` badge, short status line |
| `error` | at its desk | small red dot |
| `done` | idle spot (lounge / rooftop / lead armchair) | small ✓ |
| `idle` or nothing pushed | idle spot | none |

- A `working` status with no update for **10 minutes** is shown as idle. The tooltip says why.
- A `waiting` status with no update for **48 hours** is shown as idle (tooltip explains). Tap **N bots need you** (or **1 bot needs you**) in the HUD to focus the camera on Chris's office.
- `handoffTo`: the bot carries a folder to the recipient's desk (for Grok Bot, the glass corner office), drops it on the desk, then goes where its own state says. The folder stays on the recipient's desk until the recipient pushes its next status.
- The page polls `/api/office` every 12 seconds and immediately when the tab becomes visible again.
- **Feed warning banner**: shown only when the store can't be read, the last heartbeat failed, the heartbeat has stopped, or no status push has arrived for 45+ minutes. An idle office is normal and never triggers a warning.

### Usage board: Grok Bot weekly usage left

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

The top row of the wall board (and the chip in the bottom-right corner) shows the reading with the newest `readAt`: percent left, reset time, and "as of" time, all in the viewer's local time. It says **No reading yet** until a real reading arrives. Chris's bot is expected to push readings three times a day. The rows below it come from the providers' APIs; see [AI service usage rows](#ai-service-usage-rows).

## Cloud agents as contractors

Chris's running Cursor cloud agents appear as visiting **contractors**: blocky people in a hi-vis orange vest with reflective stripes, a white safety helmet, and a visitor badge, so they never read as roster bots. They work at six contractor hot desks on both sides of the Engineering desks (under the two **CONTRACTORS** wall signs). A contractor arrives through the office elevator lobby when an agent starts running and walks back out when the agent finishes or expires.

- **Source:** the [Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints) with `CURSOR_API_KEY` (Basic auth, key as username), fetched on the 5-minute heartbeat cron and stored as one row per fetch in `cloud_agent_snapshots`.
  - `GET /v1/agents?limit=100&includeArchived=false` (follows `nextCursor`, up to 5 pages). An agent with `status: "ACTIVE"` is running. `IDLE` (finished) and `ARCHIVED` (archived or expired) agents leave.
  - `GET /v1/agents/{id}` for the repo name (only for agents not seen before), and `GET /v1/agents/{id}/runs/{latestRunId}` for the run state.
- **Tag:** a low-contrast tag with a run-state dot, a short title (the agent's name, trimmed to 26 characters on the tag and 48 in storage), and the repo name only, for example `Fix flaky login test · web-app`. Hover or tap shows the title, repo, state, and start time. Prompts, branches, PR links, summaries, and run results are never fetched into the store or sent to the browser.
- **State:** `Running` (types at the desk), `Starting` (run `CREATING`), `Background work` (run `WAITING_FOR_BACKGROUND_WORK`), or `Active` (agent active, run state unavailable).
- **Cap and overflow:** at most 6 contractors are shown, longest-running first, so the people at desks stay put. Extra running agents are counted on a `+N more cloud agents` label in Engineering and in the HUD (`Cloud agents: 8 running, 6 at desks`). When a contractor leaves, the next agent in line takes the free desk.
- **HUD line** under the feed line: `Cloud agents: 3 running · as of 11:25 AM`, `none running`, `waiting for the first fetch`, `not connected` (no key, or the API refused the key), or `stale since <time>`. Contractors are shown only from a successful snapshot less than 15 minutes old. If the latest fetch failed but the previous one is still that fresh, they stay and the line adds `last fetch failed`. Older than that, they leave and the line says stale.
- **Plan:** a user API key from Cursor Dashboard → API Keys (or a team service account key), on a Cursor plan that includes Cloud Agents. The list covers the key owner's agents.

## AI service usage rows

The wall board (and the **All usage** panel that opens from the usage chip, or from the Usage view on a phone) shows one row per source. Each row has its own **As of** time, or **Not connected**, or **Stale since <time>**. Readings come from the hourly `/api/cron/usage` cron and are stored with `readAt` in `provider_usage_readings`.

| Row | Env var | Official API | Shows | Plan needed |
|---|---|---|---|---|
| Grok Bot | (pushed) | `POST /api/usage` (unchanged) | Weekly usage left, reset, as-of | n/a |
| Cursor | `CURSOR_ADMIN_API_KEY` | [Admin API](https://cursor.com/docs/account/teams/admin-api) `POST /teams/spend` (Basic auth) | Team spend this billing cycle (`overallSpendCents` summed), on-demand part (`spendCents`), cycle start, member count | **Cursor team plan only.** Cursor's API overview currently lists the Admin API under Enterprise teams. Without the key, or when the API refuses it (401/403/404), the row shows **Not connected**. |
| OpenAI API | `OPENAI_ADMIN_KEY` | [Usage and Costs API](https://platform.openai.com/docs/api-reference/usage) `GET /v1/organization/costs` and `/v1/organization/usage/completions` (Bearer) | Cost this month and last 7 days; completions input/output tokens this month | An OpenAI organization Admin key (`sk-admin-…`), created by an org Owner under Organization settings → Admin keys. Project or user keys are refused. |
| Anthropic API | `ANTHROPIC_ADMIN_KEY` | [Usage and Cost Admin API](https://docs.anthropic.com/en/api/usage-cost-api) `GET /v1/organizations/cost_report` and `/v1/organizations/usage_report/messages` (`x-api-key`, `anthropic-version: 2023-06-01`) | Cost this month and last 7 days; message input (uncached + cache read + cache write) and output tokens this month | An Anthropic Console organization with an Admin API key (`sk-ant-admin01-…`, org admin role, Console → Settings → Admin keys). Not available for individual accounts; Claude Enterprise (claude.ai) orgs use a different Analytics API. |

- "This month" is the UTC calendar month. "Last 7 days" is today (UTC, so far) plus the previous 6 UTC days. Both match the providers' daily UTC buckets. Amounts are USD.
- Status rules: **Not connected** when the key is missing, when the API refuses the key, or when no fetch has ever succeeded. **Stale since <time of last good reading>** when the latest fetch failed for another reason (network, rate limit, 5xx) or the last good reading is over 3 hours old. Stale rows keep the last real values and say so.
- A row never shows numbers it didn't get: a partial failure (costs OK, tokens refused) shows the costs with "Token counts unavailable".

### Rotating a provider key

1. Create the new key at the provider (Cursor Dashboard → API Keys, OpenAI → Organization settings → Admin keys, or Claude Console → Settings → Admin keys).
2. In Vercel → Project → Settings → Environment Variables, edit `CURSOR_API_KEY`, `CURSOR_ADMIN_API_KEY`, `OPENAI_ADMIN_KEY`, or `ANTHROPIC_ADMIN_KEY` for Production.
3. Redeploy (environment variable changes only apply to new deployments).
4. Wait for the next cron, or run it now: `curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/usage` (or `/api/cron/heartbeat` for cloud agents). Check that the row's **As of** time updated.
5. Revoke the old key at the provider.

To disconnect a source, delete its env var and redeploy. The row switches to **Not connected** right away, even if old readings exist.

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
- Provider keys are server-side only (cron and API functions). Stored and displayed error details are short, generic messages such as `API refused the key (403)`; they never include keys, headers, or response bodies. Cloud agent data is served only through the authenticated `/api/office` read API, and only the short fields listed above. The cron responses report outcomes only, never amounts.
- No secrets are committed. `.env.example` lists the names only, and `.env*.local` and `.data/` are git-ignored.

## Scene notes

- Six department zones (Engineering, Finance, Sales, Marketing, Research, Operations), each with the name lettered into the carpet in front of the desks so nothing covers it. There is also Grok Bot's glass corner office, a lounge, a break room, a research video wall (animated charts, US map, AI terminal), a server room with blinking racks, hot desks, and an elevator lobby.
- The rooftop deck on the tower behind the office has lounge chairs around a fire pit, loungers, string lights, a bar, palms, and a skyline with hills. Rooftop-zone bots ride the elevator down to a hot desk only while working.
- Bots are small blocky people in their flat, matte profile color (Lambert, no metalness or specular) with their accessory. A null `avatarColor` renders neutral gray.
- Sharpness: the renderer pixel ratio is always `devicePixelRatio`. Canvas textures are full resolution with max anisotropy. If frame rate is poor, shadows are turned off; resolution is never reduced. There is no bloom.
- Name tags are small and low-contrast, pinned above the head, and hidden when a wall or the tower is in the way. When tags collide at a wide zoom, the most informative one keeps its name and the others collapse to their state badge, so `?`, red dots, and ✓ always stay visible. Hover (or tap) shows full name, title, state, message, and age.
- Idle bots have no idle animation, so idle bots and tags are pixel-identical frame to frame (see `tests/e2e/run.mjs`).
- Camera: orbit, pan, and zoom, plus quick buttons for Office, Rooftop, Lead, and Usage.
- **Simulate Work** (or `?simulate=1`) runs a compressed workday for demos, in the browser only, with a "Simulation" label shown while it runs. It also simulates a few contractors with generic titles and placeholder repo names (the HUD says `Cloud agents: N simulated`). It never fetches from or writes to any API, and the usage board keeps showing live readings.

## Tests

```bash
npm test          # unit: validation, stale rule, feed health, auth/gate, stores, layout and routes, provider fetchers
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/db npm run test:pg   # SQL store + migrations on real Postgres
npm run e2e       # Playwright: dev server, CLI pushes, screenshots, idle pixel diff (writes /opt/cursor/artifacts/office)
```

- Provider fetchers are unit-tested against mocked responses in the documented shapes (`tests/fixtures/providers.mjs`), including auth headers, pagination, the month and 7-day windows, and the Not connected and Stale states.
- `npm run e2e` starts a local mock of the four provider APIs (`tests/e2e/mock-providers.mjs`, made-up numbers) and points the dev server at it via the `*_API_BASE` variables. It checks contractors arriving, overflowing, and leaving, the new usage rows including the stale and not-connected states, and that no prompt, branch, PR link, or run result reaches `/api/office`.

`npm run e2e` needs Chromium for Playwright (`npx playwright install chromium`).

## Assumptions

- Idle spots: office bots use the lounge, Grok Bot uses the armchair in his office, and rooftop bots use the fire-pit chairs. `done` counts as idle for location and shows a ✓.
- `handoffTo` may name any roster bot. The folder goes to that bot's desk, which for the lead is the corner office. Only new handoffs animate: on page load, a handoff pushed within the last 2 minutes replays, and older ones don't.
- Rooftop bots have fixed hot desks (one per rooftop bot, in roster order).
- The roster's `"gray"` profile color (Altman Husk, Granola Bot) renders as a mid gray, slightly darker than the neutral gray used for bots with no color set.
- Times are shown in the viewer's browser timezone. When several usage readings exist, the one with the latest `readAt` is shown.
- History tables are pruned by the heartbeat: status events after 30 days, heartbeats after 7 days, usage readings and provider readings after 90 days, cloud agent snapshots after 2 days (the latest good reading or snapshot is always kept).

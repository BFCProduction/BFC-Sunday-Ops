# BFC Sunday Ops Hub

A progressive web app for BFC Production to manage Sunday morning operations — replacing the Google Sheets gameday checklist with a live, multi-user hub.

**Live app:** https://bfcproduction.github.io/BFC-Sunday-Ops/

---

## Features

- **Gameday Checklist** — 73 checklist items organized by role (A1, Video, Graphics, Lighting, Stage) and section. Items are checked off with initials and timestamp. Completions are stored in Supabase and reset each Sunday automatically.
- **Issue Log** — Log issues during the service with severity levels (Low / Medium / High / Critical). Medium and above prompt an option to push to the Monday.com production tasks board.
- **Service Data** — Four sub-tabs:
  - *Attendance* — 9am and 11am headcounts
  - *Runtimes* — Service and message runtimes, auto-populated from ProPresenter via relay script
  - *Weather* — Weather conditions (placeholder, API integration pending)
  - *Loudness Log* — Max dB A Slow and LAeq 15 readings for both services with goal flagging (9am ≤88 dB, 11am ≤94 dB)
- **Post-Service Evaluation** — Section ratings (Audio, Video, Lighting, Stage, Stream, Overall), open text for what went well / didn't go well, and stream analytics (YouTube, RESI, Church Online)
- **Admin Mode** — Password-protected admin access via the lock icon in the sidebar. Enables editing, adding, and deleting checklist items and runtime field definitions.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v3 |
| Icons | lucide-react |
| Database | Supabase (PostgreSQL) |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions |
| Analytics cron | GitHub Actions (Sunday afternoon) |
| Runtime relay | Node.js script (local network) |

---

## Supabase Tables

| Table | Purpose |
|---|---|
| `sundays` | One row per Sunday — the daily session anchor |
| `checklist_items` | Admin-managed checklist item definitions |
| `checklist_completions` | Check-offs per item per Sunday (with initials) |
| `attendance` | Headcounts per Sunday |
| `runtime_fields` | Admin-defined runtime field configs (PP connection, pull time) |
| `runtime_values` | Captured runtime values per field per Sunday |
| `issues` | Issue log entries per Sunday |
| `loudness` | Loudness readings per Sunday |
| `weather` | Weather data per Sunday |
| `evaluations` | Post-service evaluation per Sunday |
| `stream_analytics` | YouTube / RESI / Church Online analytics (cron-populated) |
| `propresenter_config` | Legacy single-row PP config (superseded by runtime_fields) |

---

## GitHub Actions Workflows

### `deploy.yml`
Triggers on every push to `main`. Builds the React app and deploys to the `gh-pages` branch.

Required secrets:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### `sunday-analytics.yml`
Runs at 2:30 PM CT every Sunday (`30 20 * * 0` UTC). Pulls YouTube and RESI stream analytics and writes to Supabase.

Required secrets:
- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `YOUTUBE_API_KEY`
- `RESI_EMAIL`
- `RESI_PASSWORD`

---

## ProPresenter Relay Script

The relay script (`scripts/propresenter-relay.js`) connects to ProPresenter computers on the local network, reads timer values via the ProPresenter REST API (`/v1/timers/current`), and writes them to Supabase at the times configured in the admin panel.

### Setup on relay computer

```bash
git clone https://github.com/BFCProduction/BFC-Sunday-Ops.git
cd BFC-Sunday-Ops
npm install --legacy-peer-deps
```

Create `.env.local`:
```
VITE_SUPABASE_URL=https://jrvootvytlzrymwoufzu.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

### Usage

```bash
# Wait until each field's configured pull time (normal Sunday operation)
node scripts/propresenter-relay.js

# Pull all fields immediately regardless of time/day (testing)
node scripts/propresenter-relay.js --now

# Probe ProPresenter API endpoints for debugging
node scripts/propresenter-relay.js --probe --now
```

### Cron job (runs automatically every Sunday)

```bash
crontab -e
```

Add:
```
0 8 * * 0 /usr/local/bin/node /Users/production/Documents/BFC-Sunday-Ops/scripts/propresenter-relay.js >> /tmp/pp-relay.log 2>&1
```

Check log output:
```bash
cat /tmp/pp-relay.log
```

### Configuring runtime fields

In the app: **Admin mode → Service Data → Runtimes → Runtime Field Definitions**

Each field has:
- Label (e.g. "9am Service Runtime")
- ProPresenter IP and port
- Timer number (1 = first timer in ProPresenter's timer list)
- Pull time (HH:MM)
- Day of week

---

## Admin Mode

Click the **lock icon** at the bottom of the sidebar and enter the admin password.

Admin password is set via the `VITE_ADMIN_PASSWORD` GitHub secret. It is baked into the frontend bundle at build time — intended as a convenience lock, not a security boundary.

In admin mode:
- **Gameday Checklist** — edit, add, or delete checklist items per section
- **Service Data → Runtimes** — manage ProPresenter runtime field definitions

Exit admin mode with the **Exit Admin** button at the bottom of the sidebar.

---

## Local Development

```bash
npm install --legacy-peer-deps
cp .env.example .env.local   # add your Supabase credentials
npm run dev
```

App runs at `http://localhost:5173/BFC-Sunday-Ops/`

---

## Deployment

Push to `main` — GitHub Actions builds and deploys automatically. First-time setup:

1. Create repo under `BFCProduction` org
2. Add all required secrets under **Settings → Secrets and variables → Actions**
3. Enable GitHub Pages under **Settings → Pages → gh-pages branch**

---

## Pending / Future Work

- YouTube analytics script (`scripts/fetch-youtube.js`)
- RESI analytics scraper (`scripts/fetch-resi.js`)
- Supabase Edge Function for Monday.com issue push (`push-monday-issue`)
- Weather API integration (OpenWeatherMap)
- Post-service summary email via Gmail (Google Workspace)

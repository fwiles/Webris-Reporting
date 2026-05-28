# Webris Reporting Portal

Auto-generated Meta (Facebook/Instagram) ads dashboards for every client in our
Windsor.ai account. One dashboard per client, refreshed **hourly month-to-date**, hosted
on Vercel. New clients appear on their own within the hour — **no code change, no redeploy**.

## How it works

```
Vercel Cron (hourly)  ──▶  /api/cron/refresh
                              1. discover Meta accounts from Windsor (live)
                              2. auto-onboard any new account (zero-touch)
                              3. pull MTD / prev-month / campaigns / YTD per client
                              4. compute KPIs (lib/metrics.js)
                              5. once/day: generate "Webris Notes" via Claude (lib/notes.js)
                              6. write snapshot to Vercel KV

Browser
  /                          → /api/clients  → client cards (index.html)
  /dashboard.html?client=X   → /api/data?client=X → snapshot → render
```

- **KV snapshots are the source of truth** for which dashboards exist. Any client with a
  snapshot gets a working page.
- **`config/clients.json` is an optional overlay** — it only adds Google Drive quick links
  and branding. A client with no entry still gets a dashboard (with empty links and a
  "⚠ needs Drive links" badge on the index).

## Project layout

| Path | Purpose |
|---|---|
| `config/clients.json` | **The file you edit.** Drive links + display names per client. |
| `lib/windsor.js` | Windsor.ai REST calls (discover accounts, fetch data). |
| `lib/metrics.js` | KPI/YTD math, ported from the original mockup so numbers match. |
| `lib/notes.js` | Daily AI summary via the Anthropic API. |
| `lib/clients.js` | Slug derivation + config overlay merge. |
| `lib/store.js` | Vercel KV read/write (roster + snapshots). |
| `api/cron/refresh.js` | Hourly job: discover, onboard, compute, store. |
| `api/data.js` | `GET /api/data?client=<slug>` → one snapshot. |
| `api/clients.js` | `GET /api/clients` → list for the index page. |
| `public/dashboard.html` | The dashboard template (shared by all clients). |
| `public/index.html` | Landing page listing all clients. |
| `portal_SGF.html` | Original single-client mockup (reference only, not deployed). |

## Setup

1. **Install deps**
   ```bash
   npm install
   npm i -g vercel   # if you don't have the CLI
   ```
2. **Create a Vercel project** and a **KV store** (Storage → Create → KV), linked to the project.
3. **Set environment variables** (Vercel dashboard → Settings → Environment Variables, and
   in `.env.local` for local dev — see `.env.example`):
   - `WINDSOR_API_KEY` — from your Windsor.ai dashboard (Settings → API).
   - `ANTHROPIC_API_KEY` — for the daily notes.
   - `CRON_SECRET` — any long random string (protects the cron endpoint).
   - `KV_REST_API_URL`, `KV_REST_API_TOKEN` — auto-added by `vercel env pull` once KV is linked.
4. **Run locally**
   ```bash
   vercel env pull .env.local
   vercel dev
   # trigger a refresh manually:
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/refresh
   ```
   Then open `http://localhost:3000/` and click into a client.
5. **Deploy**
   ```bash
   vercel deploy --prod
   ```
   The hourly cron (`vercel.json`) starts running automatically. Vercel injects the
   `Authorization: Bearer $CRON_SECRET` header on its scheduled calls.

## Runbook

**Add a new client** — nothing to do. Link the Meta account in Windsor; the next hourly
run onboards it and its dashboard goes live. It shows a "⚠ needs Drive links" badge until
you add links.

**Add / change Google Drive quick links** — edit `config/clients.json`. Match the client by
`windsorAccountId` (preferred) or `windsorAccountName`. Example:
```jsonc
"sweet-law": {
  "windsorAccountId": "2504979786463966",
  "windsorAccountName": "Sweet Law",
  "displayName": "Sweet Law",
  "driveLinks": [
    { "label": "Ad Creatives", "icon": "🎬", "url": "https://drive.google.com/drive/folders/XXXX" }
  ]
}
```
Redeploy (or wait for the next cron run, which reads the file fresh).

**Exclude an internal / test account** — add its exact Windsor account name to the
`_exclude` array at the top of `config/clients.json`. Excluded accounts never get a
dashboard. (Pre-seeded with `"The Blueprint Training 2"`.)

**Change the look** — edit `public/dashboard.html` once; it's shared by every client.

**Tune the AI note** — edit the prompt in `lib/notes.js`.

**Force a refresh** — `curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/refresh`.

## Notes / limitations (v1)

- Creative Requests (from the mockup) are intentionally out of scope for v1.
- Google Drive links are manual; folders aren't auto-discovered because the current Drive
  structure is inconsistent. Revisit once folders are standardized under one "Clients" parent.
- Only the Meta (`facebook`) connector is wired up. Google Ads clients are out of scope.
- No login on the portal — host behind Vercel password protection or SSO if needed.

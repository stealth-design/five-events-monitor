# Festive Monitor

Dashboard that audits https://festive.fivehotelsandresorts.com and notifies you when something changes.

## What it detects
| Change | How |
|---|---|
| New event | appears on the homepage / in WordPress |
| Event set to **draft**, private or deleted | drops out of the WordPress API and its page returns 404 |
| Event removed from the homepage | still published, but no longer listed |
| **Broken link** (404 / 5xx / no response) | every "Learn More", title and event-page link is opened, re-checked once before alerting |
| Edits | title, venue, price, date, hotel, category, description, links; plus "edited in WordPress" |

**Baseline:** the first audit records the site as the *ideal* state. "Open issues" lists everything that still differs from it until it's fixed or you click **Accept as baseline**. Notifications fire only for *new* changes since the previous audit, so you're not re-alerted every run.

Links answering 403/429 (the site's firewall) show as "couldn't verify" and never trigger alerts.

## Run locally
```bash
npm install
npm run dev        # http://localhost:3000 — data is stored in .data/store.json
```

## Deploy to Vercel
1. `vercel` (or import the folder in the Vercel dashboard).
2. **Storage → Create → Upstash for Redis** and connect it to the project (adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
3. Environment variables (see `.env.example`):
   - `CRON_SECRET` — any long random string.
   - Notifications, any of: `SLACK_WEBHOOK_URL` · `RESEND_API_KEY` + `NOTIFY_EMAIL_TO` (+ `NOTIFY_EMAIL_FROM`) · `NOTIFY_WEBHOOK_URL`.
   - Optional `DASHBOARD_PASSWORD` to password-protect the dashboard (user `admin`).
4. Redeploy, open the dashboard and click **Run audit now** to set the baseline.
5. Set up cron-job.org (below).

### Scheduling (cron-job.org)
Audits run **daily at 09:00 and 19:00 Dubai time** by default — change the times any time with **Schedule audit** in the dashboard.

Vercel can't wake itself up, so a free [cron-job.org](https://cron-job.org) job pings the app; the app decides whether an audit is due:

1. Create a cron-job.org account → **Create cronjob**.
2. URL: `https://<your-app>.vercel.app/api/cron?key=<CRON_SECRET>`
3. Schedule: **every 15 minutes**.
4. Save. Each ping replies instantly (`skipped` or `started`); the audit itself runs in the background, so cron-job.org's 30 s timeout is never a problem.

Pinging every 15 min (rather than only at 09:00/19:00) means changing times in the dashboard needs no cron-job.org changes. `…/api/cron?key=<CRON_SECRET>&force=1` runs an audit immediately.

## Layout
- `lib/scrape.ts` — homepage cards + WordPress API (`/wp-json/wp/v2/experience-five`)
- `lib/links.ts` — gentle link checker (3 at a time, retries non-OK links)
- `lib/diff.ts` — snapshot comparison → changes
- `lib/audit.ts` — runs an audit, stores snapshot/history, sends notifications
- `lib/notify.ts` — Slack / email (Resend) / webhook
- `app/components/Dashboard.tsx` — the dashboard UI
- `data/` — tracker spreadsheets and earlier scrape output (not deployed)

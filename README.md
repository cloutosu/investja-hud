# InvestJA Terminal

A bank-style dashboard and trade console for an [investja.org](https://investja.org) team. One Netlify site: a React frontend plus Netlify Functions that log in to investja.org, trade, and record history.

```
browser ──► /api/* (Netlify Functions) ──► investja.org
              │  tick.mjs, every minute: run due trades, scrape, record history + movers
              └─ Netlify Blobs: latest data, 24 h history, 5-min snapshots, trade queue, trade log
```

## Features

- **Buy, sell and schedule** with swipe-to-confirm. The thumb turns into a ring, closes into a circle and draws a checkmark when the order fills. Scheduled orders retry every 5 minutes until the server accepts them (market closed, 1-hour hold).
- **Charts** for your equity or earnings (equity minus the day's start), per minute for the last 2 hours and per 5 minutes up to 24 hours, with a bar strip of change per tick. Open any team for the same chart plus a +5%/day projection.
- **Movement panel**: biggest gainers and losers over 1m, 5m, 15m, 1h, 6h and 24h, plus your own movement in each window.
- **Lock screen**: the code is checked by the server, not the browser. Two codes: `ACCESS_CODE` can trade, `VIEW_CODE` (optional) is read-only, so friends can watch without being able to touch your account. Six wrong tries lock that IP for 15 minutes.
- Three themes (Ember, Frost, Dune), desktop and phone layouts, daily report, threat radar.

## Exits, alerts and journal

- **Exit rules** (take profit, stop loss, trailing stop) fire from the 1-minute tick, only after the 1 h hold, and the first fill cancels the others on that position. A buy can arm exits in the same order.
- **Alerts**: SELL READY, exit fills, a rank drop while you are in the top 50, and a 2% equity drop in 5 minutes. Tap the bell to allow browser notifications. To get them with the tab closed, set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`npx web-push generate-vapid-keys`).
- **Sell all ready** only sells positions whose hold we know has ended (buys placed through this app). Buys made on investja.org directly have no timer and are never bulk-sold.
- **Trade journal** computes win rate and hold time from sells that have a logged fill price and average cost.

## Deploy on Netlify

1. Push this repo to GitHub, then Netlify → Add new site → Import from Git. `netlify.toml` sets the build (`npm run build`, publish `dist`, functions in `netlify/functions`).
2. Site configuration → Environment variables:

   | Variable | |
   |---|---|
   | `INVESTJA_USER` | required: your investja team login |
   | `INVESTJA_PASS` | required: your investja password |
   | `ACCESS_CODE` | required: the owner code that unlocks trading |
   | `VIEW_CODE` | optional: a read-only code for friends |
   | `TARGET_TEAM` | optional (default `Rahman Power Squared`) |

3. Trigger deploy → Clear cache and deploy site. Open the site and enter your `ACCESS_CODE`.

Check `https://<site>.netlify.app/api/health`: it should say `"configured":true`. The first dashboard load triggers a scrape; charts and movement windows fill in as the minute scheduler runs (the 24h window needs a day of data).

## Run it off Netlify (any always-on machine)

`npm run build && npm start` serves the UI, the `/api/*` handlers and the 1-minute tick from one Node process (Node 22). State is kept as JSON files in `STORE_DIR` (default `./data`), so keep that directory on a persistent disk. Same env vars as the Netlify setup, plus optional `PORT` (8080), `TICK_MS` (60000) and `STALE_MS`.

Docker: `docker build -t investja . && docker run -d --restart unless-stopped -p 8080:8080 -v investja-data:/data --env-file .env investja`.

Put it behind HTTPS (Caddy, or a Cloudflare Tunnel) so the browser allows service workers and notifications. The tick only runs while the process runs, so use a host that stays up: scheduled sells, exits and alerts stop when it is off. Free hosts that sleep when idle will miss ticks.

## Local development

```bash
npm install
cp .env.example .env        # fill in the values
npm run dev                 # vite on :5173 + the functions on :8888 (proxied as /api)
```

To try it without touching investja.org: `npm run mock` (fake site on :4000) and set `BASE_URL=http://localhost:4000`, `INVESTJA_PASS=mock` in `.env`.

## Limitations

- **Netlify usage.** Every poll and every minute tick is a function call, and the tick scrapes 2,525 rows. The page polls every 20 s while the tab is visible and stops while hidden. A few people leaving tabs open all day can use up the free plan.
- **The scheduler.** The 1-minute schedule is a Netlify feature; if it is unavailable on your plan, `/api/live` refreshes the data itself whenever it is older than 2.5 minutes, but scheduled trades then only run while someone has the page open.
- **Trading rules are the server's.** The terminal never tries to get around market hours (9:35–16:00 ET, weekdays), the 1-hour hold, the loan cap or the $25 fee. Orders it can't place come back as an error toast, or as "retrying" in Scheduled Trades.
- **Selectors come from the spec, not the live site.** If the status banner says "parse incomplete" or "0 teams", check the function logs and adjust `server/parsers.js`.
- **Buys and sells you make on investja.org directly** don't appear in the trade log, so the daily report's trade count only includes orders placed here.
- **Sessions** last 12 hours; changing `ACCESS_CODE` or `INVESTJA_PASS` signs everyone out.

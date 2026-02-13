Development notes — how to run and test extra features

1) Install dependencies

```bash
npm install
```

2) Convert images (place JPG/PNG in `images/`)

```bash
npm run convert-images
```

3) Start dev server (serves static files + dev API endpoints)

```bash
npm run start-server
# open http://localhost:3000
```

4) Build a Workbox service worker (generates `sw.workbox.js`)

```bash
npm run build-sw
```

5) Run Lighthouse (after starting server)

```bash
npm run lighthouse
```

Notes
- The `server/` folder contains a small Express app with `/api/sync-watchlist` and `/api/search` for local testing. Replace with real backend in production.
- The SW currently in `sw.js` is runtime-coded; running `build-sw` will generate a Workbox-based `sw.workbox.js`. You can replace registration to `/sw.workbox.js` when ready.
- Sentry and analytics load only after user consent; set `window.SENTRY_DSN` in `config.js` to enable Sentry.

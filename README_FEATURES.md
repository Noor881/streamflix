StreamFlix — Feature scaffolding

What I added
- `scripts/watchlist.js` — simple watchlist (localStorage) + UI hooks using `data-watch-id` attributes.
- `scripts/search.js` — minimal client-side search and UI hook (replaceable with Fuse.js/server search).
- `scripts/recommendations.js` — local popularity-based recommendations (records views).
- Hero section in `index.html` with image-first layout and buttons.

How to use
- Add images `hero.jpg`, `hero.webp`, `hero.avif`, and `logo.webp`/`logo.avif` to the site root or `images/` and update paths.
- Watchlist: any button with `data-watch-id` will toggle add/remove from My List.
- Search: add a text input with `data-search-input` and `data-search-results="#selector"` to wire search UI.
- Recommendations: call `Recommend.recordView(id)` when a user plays an item; call `Recommend.top()` to get popular ids.

Next steps I recommend
- Replace `scripts/search.js` with a Fuse.js implementation for fuzzy search and ranking (we added `fuse.js` dependency).
- Replace localStorage watchlist with `idb` or server-backed sync for cross-device persistence.
- Implement playback events to call `Recommend.recordView()` on play.

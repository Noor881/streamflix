# HD Watchzone audit repairs — 30 September 2026

This records the disposition of the 35 findings in the detailed audit and the subsequently reported inconsistent cards. It is not a guarantee of rankings, field Core Web Vitals, legal compliance, ad-free third-party playback, or every-device readiness.

## Repairs and scoped alternatives

| Audit item | Disposition |
| --- | --- |
| 1. Disconnected watchlist | Shared type-aware local storage, old local/IndexedDB migration, and storage failure handling. No cloud account sync claimed. |
| 2. Wrong TV deep links | Slug-aware path parsing, positive season/episode numbers, selected episode retained across provider changes and manual Next. |
| 3. False contact success | Working email-composer link includes entered details. No message-delivered claim; actual mailbox ownership/delivery not verified. |
| 4. Browse overfetch | Selected API page fetched; bounded multi-page helper; pagination uses API totals. |
| 5. Stale async routes | Route-generation checks prevent stale render commits. |
| 6. Clean search query loss | Clean and hash routes include query/page parameters. |
| 7. Stale deployment caches | Mutable JS/CSS revalidate; service worker no-cache and updateViaCache:none; asset versions advanced. Production headers require post-deployment verification. |
| 8. Analytics ignores consent | Shared explicit opt-in loader; revoke disables GA; unconditional GA/Ahrefs removed. |
| 9. Nested Trending rows | One row ID and wrapper; tab updates replace cards only. |
| 10. Detail footer overflow | Negative outer margins removed, bounded layout and mobile spacing. |
| 11. Missing detail concept layout | Player and title/details panel side-by-side on desktop, stacked on phone. |
| 12. Nonmatching selectors | Detail/server/fullscreen rules target actual components. |
| 13. Old detail logo | Shared current logo asset. |
| 14. Incomplete detail navigation | Working root genre/search routes and mobile bottom navigation. |
| 15. Stale active nav | Route-aware desktop/mobile state with aria-current and account metadata. |
| 16. Hidden excess home content | Eight cards per visible row, explicit Trending view-all. |
| 17. Conflicting CSS | Authoritative final cards.css owns poster/card dimensions; compact hero, footer and detail layout rules aligned. Legacy stylesheets still contain other components; this is not a complete CSS rewrite. |
| 18. Invented watch progress | Removed page-time progress tracking; honest Recently Viewed presentation. |
| 19. Unconnected autoplay | Unsupported toggle removed; manual Next implemented and tested. Automatic video-completion advance is not offered. |
| 20. Unvalidated provider messages | Obsolete duplicate progress engine/listener removed. No trusted playback telemetry integration claimed. |
| 21. Dropped sync queue | Unsupported sync disabled; existing IndexedDB/outbox data not deleted. |
| 22. Aggressive SW timeout | Twelve-second network-first timeout, cached fallback, bounded caches, opaque image and real 404 handling. |
| 23. Embed ad guarantees | Accurate external-provider disclosures; universal HD/language claims removed from cards/provider labels. Third-party ads, redirects and availability remain outside control. |
| 24. Overwritten sitemap routes | Generator includes categories/info and canonical title bases, excludes speculative episodes/private pages. No fabricated lastmod. |
| 25. Misleading video schema | Unverified VideoObject/watch-count/upload-date/hidden review markup removed. Movie/TVSeries and breadcrumb metadata retained. |
| 26. Canonical/social mismatch | Consistent slug canonicals, social URL updates and server-rendered initial metadata for public routes. Genuine 404 and retryable 503 states. |
| 27. Keyword-tag regeneration | Removed; visible existing comparison text remains without extra repeated keyword tags. |
| 28. Placeholder links/counter | Nonworking social controls and visitor counter removed. |
| 29. Carousel accessibility | Descriptive controls, larger dot targets, pause/resume, inactive slide inert state, focus/pointer/reduced-motion/visibility suspension. |
| 30. Install accessibility | aria-hidden follows visibility; retry state reset; mobile placement avoids bottom nav. |
| 31. Tiny low-contrast labels | Larger readable labels and visible keyboard focus. Comprehensive WCAG/zoom/screen-reader certification not performed. |
| 32. Fake admin authentication | Removed client-side credentials and fake privileged dashboard; explicit read-only local diagnostics. Real server administration requires a backend and identity setup. |
| 33. Unused homepage requests | Four visible homepage data sources only; redundant genre initialization removed. Visible rows still share one loading boundary. |
| 34. Build/SEO side effects | Bounded sitemap requests, nonzero failure without overwriting valid output, no automatic IndexNow submission, regression CI. |
| 35. Duplicate engines/bundles | Dead player engine and unreferenced minified/consent bundles removed (recoverable in Git). |
| Additional card defects | Same 2:3 portrait poster, fixed title/info height and bounded flex widths across home/catalog/Trending/recommendations. Mobile two-column grids; long titles cannot enlarge cards. |

## Verification evidence

- `npm test`: all 14 regression tests pass. Covers pagination, stale render suppression, clean query/page routing, escaped card titles/unique row ID, episode paths, watchlist migration, consent, initial metadata/schema, cache policies, sitemap route selection, request budget, metadata outage behavior and service-worker opaque-image/404 handling.
- Browser: clean mobile Batman search and page 2, 320px search grid without overflow, saved movie visible in My List, TV S2E3 direct load, Next to S2E4, server switching retains S2E4, fullscreen entry/exit visually verified.
- Movie recommendations and Trending: exact equal card dimensions at 320, 390, 768, 1024 and 1280px; no horizontal overflow. At 320: 138×291px, at 390: 173×343.5px, at the larger three widths: 154×315px.
- Homepage: 32 poster cards, mobile 173×259.5px posters; TV tab remains one row. Desktop homepage overall cards uniformly 154×315px at 1280 and 190×369px at 2560, no overflow.
- Local screenshots saved outside the repository: `outputs/mobile-related-fixed.jpg` and `outputs/mobile-trending-fixed.jpg`.
- Successful bounded sitemap generation produced 1,468 canonical URLs. Fewer than the previous file because duplicate/speculative episode URLs are excluded.
- PageSpeed API returned HTTP 429; browser analysis stalled. No Lighthouse score or field Core Web Vitals conclusion is reported.
- Full-film playback, provider ads, native iPhone/Safari fullscreen and every-device compatibility remain unverified.

## Read-only configuration audit

Authorized by the user after the earlier environment exclusion. No secret values were read or printed and no credentials/environment files were changed.

- No local or tracked `.env*` files and no local Vercel project link were found.
- GitHub authentication: active account Noor881; repository Noor881/streamflix. GitHub environments Preview and Production exist.
- Workflow secret-name comparison: TMDB_API_KEY exists. REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_PASSWORD, REDDIT_SUBREDDIT, REDDIT_USERNAME, TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID are absent. Their associated integrations require owner setup; not fixed by inventing credentials.
- Vercel environment values/health cannot be verified from the available account access. The existing client-visible TMDB identifier is not a confidential browser secret; moving it behind a server proxy would be a separate infrastructure change.
- Old client-side admin credentials were removed from active source but remain in Git history. If those strings were reused for real accounts, the owner should rotate them.

## Deployment follow-up

Push main, inspect regression CI and Vercel status, then verify deployed initial title/category HTML and actual mutable-asset/service-worker headers. Deployment verification results are recorded in the delivery message rather than inferred from local tests.

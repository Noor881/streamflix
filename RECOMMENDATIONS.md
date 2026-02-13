# StreamFlix — Recommendations (concise)

Overview
- This document summarizes prioritized, actionable fixes I applied and further recommended improvements to improve performance, accessibility, SEO, PWA behavior, privacy, and security.

What I changed (done)
- `robots.txt`: removed `Disallow: /sw.js` so browsers can fetch the service worker. See [robots.txt](robots.txt).
- Added an offline fallback page: `offline.html` and cached it via `sw.js`. See [offline.html](offline.html) and [sw.js](sw.js).
- Deferred non-critical scripts and added `loading="lazy"` to non-critical images in `index.html`.
- Added basic Content Security Policy meta in `index.html` and a simple cookie-consent script `consent.js` (with styles in `styles.css`).
- Added keyboard focus styles and improved search input focus in `styles.css`.

High-priority next steps
- Image delivery: convert poster/hero images to WebP/AVIF and serve responsive `srcset`/`sizes`. Example markup for a poster:

  <picture>
    <source type="image/avif" srcset="/images/movie-640.avif 640w, /images/movie-1280.avif 1280w" sizes="(max-width:600px) 100vw, 33vw">
    <source type="image/webp" srcset="/images/movie-640.webp 640w, /images/movie-1280.webp 1280w">
    <img src="/images/movie-640.jpg" alt="Movie title poster" width="280" loading="lazy">
  </picture>

  Tools: `cwebp`/`avifenc` or `sharp` for batch conversion.

- Performance audits: run Lighthouse locally and fix top opportunities. Example command:

  ```bash
  npx lighthouse https://your-site-url --view --only-categories=performance,accessibility,seo --output=html --output-path=lh-report.html
  ```

- Fonts: subset Inter and use `font-display: swap` to avoid FOIT.

PWA & service worker
- Keep `index.html` out of precache (done). Use runtime caching + stale-while-revalidate for images and API responses. Use versioned cache names and automated cache-bust on deploy (we use `streamflix-v4` — bump on deploy).
- Provide an install prompt UI and test offline navigation flows.

SEO & Crawlability
- Split `sitemap.xml` into a sitemap index if >50k URLs; ensure `lastmod` is accurate and updated when content changes.
- If you rely on hash routes (/#/movie/…), consider server-rendering or dynamic rendering for crawlers, or ensure relevant metadata appears on shared links (OpenGraph/JSON-LD on detail pages).

Accessibility
- Ensure focus management after client-side navigation and use ARIA `role`/`aria-live` for dynamic updates.
- Validate contrast and provide clear keyboard affordances for all interactive controls (we added focus outlines already).

Privacy & Analytics
- Load Google Tag Manager / analytics only after consent. Current `consent.js` saves consent; move `gtag` initialization behind that consent check.

Security
- CSP: the inline `gtag` and JSON-LD are currently inline — for stronger CSP, move scripts to external files and use `nonce` or allowlist only necessary origins. Also add server headers: `Strict-Transport-Security`, `Referrer-Policy`, `X-Frame-Options`.

Developer & deployment
- Serve assets with gzip/Brotli and set long TTL for hashed assets, short TTL for HTML. Use a CDN for images and API calls to reduce latency.
- Use Workbox or similar if you want robust SW patterns quickly (runtime caching, background sync, stale-while-revalidate strategies).

Files I changed
- [index.html](index.html)
- [styles.css](styles.css)
- [sw.js](sw.js)
- [robots.txt](robots.txt)
- [offline.html](offline.html)
- [consent.js](consent.js)

Next actions I can take (pick one)
1. Run a Lighthouse audit and add the generated report to the repo (I will provide commands and interpret results). 
2. Convert existing logo + a sample set of images to WebP/AVIF and add `srcset` examples (I will add converted files and update HTML/Pictures where applicable).
3. Implement conservative GTM gating so analytics only loads after consent.
4. Integrate Workbox-based SW for better caching strategies and easier cache-busting.

If you want me to proceed, tell me which number you prefer (1–4) or reply `all` to keep automating through the list.

— End of recommendations

# Static assets and server-rendered routing

Verified September 30, 2026.

The first production smoke check found that Vercel served the physical root `index.html`, `movie.html` and `tv.html` instead of applying their rewrites. Clean catalog and title URLs worked. Vercel documents that [the filesystem takes precedence over rewrite sources](https://vercel.com/docs/project-configuration/vercel-json) and recommends renaming conflicting files.

The three templates now live under `server/templates/`. The server function reads them there, and its `includeFiles` setting keeps them available alongside the UI sources used for rendering. They are not static site output. Public URLs remain `/`, clean catalog/title URLs, the permanent `/index.html` alias, and legacy `.html?id=` aliases; TV aliases retain selected season and episode values. Missing legacy IDs return 404 rather than exposing a generic indexable template.

`npm run build` regenerates the bounded sitemap and then copies an explicit public-asset allowlist into `public/`. Vercel's `outputDirectory` points only to that directory; the root `api/render.js` remains the native function. `npm run build:static` verifies the asset build without upstream requests. JavaScript, CSS, images, icons, PWA/offline assets, admin UI and the existing verification file are preserved. API/server source, templates, tests, documentation, automation scripts, raw audit reports and local agent state are excluded from static output.

The builder never recursively deletes an output directory. It refuses unexpected pre-existing files, directories or symlinks, preserving their contents. Its ownership manifest is outside the deployed directory; generated local output and the manifest are ignored by Git and deployment uploads.

Automated checks cover the asset allowlist, template exclusion, function dependencies, rewrite source collisions, repeat builds, preservation of unexpected contents, and local HTTP parity for private/template paths and legacy aliases. These configuration/build tests do not replace a production HTTP check after deployment. The separate `www` domain still returned a platform-level 307 in the initial smoke test; changing that dashboard policy requires owner review.

Sitemap totals may change when a production build fetches a newer bounded TMDB catalog. The committed snapshot had 1,477 URLs; the first live build had 1,450 unique URLs. A changing count is not itself an error: verify canonical syntax, valid shared genres and exclusion of private/removed routes rather than asserting a fixed catalog size.

# Static assets and server-rendered routing

Verified September 30, 2026.

The first production smoke check found that Vercel served the physical root `index.html`, `movie.html` and `tv.html` instead of applying their rewrites. Clean catalog and title URLs worked. Vercel documents that [the filesystem takes precedence over rewrite sources](https://vercel.com/docs/project-configuration/vercel-json) and recommends renaming conflicting files.

The three templates now live under `server/templates/`. The server function reads them there, and its `includeFiles` setting keeps them available alongside the UI sources used for rendering. They are not static site output. Public URLs remain `/`, clean catalog/title URLs, the permanent `/index.html` alias, and legacy `.html?id=` aliases; TV aliases retain selected season and episode values. Missing legacy IDs return 404 rather than exposing a generic indexable template.

`npm run build` regenerates the bounded sitemap and then emits an explicit public-asset allowlist into `public/`. Vercel's `outputDirectory` points only to that directory; the root `api/render.js` remains the native function. `npm run build:static` verifies the asset build without upstream requests. JavaScript and CSS are minified in generated output; images, icons, PWA/offline assets, admin UI and the existing verification file remain available. API/server source, templates, tests, documentation, automation scripts, raw audit reports, installed build dependencies and local agent state are excluded from static output.

The builder never recursively deletes an output directory. It refuses unexpected pre-existing files, directories or symlinks, preserving their contents. Its ownership manifest is outside the deployed directory; generated local output and the manifest are ignored by Git and deployment uploads.

Automated checks cover the asset allowlist, template exclusion, function dependencies, rewrite source collisions, repeat builds, preservation of unexpected contents, and local HTTP parity for private/template paths and legacy aliases. These configuration/build tests do not replace a production HTTP check after deployment. The separate `www` domain still returned a platform-level 307 in the initial smoke test; changing that dashboard policy requires owner review.

Sitemap totals may change when a production build fetches a newer bounded TMDB catalog. The committed snapshot had 1,477 URLs; the first live build had 1,450 unique URLs. A changing count is not itself an error: verify canonical syntax, valid shared genres and exclusion of private/removed routes rather than asserting a fixed catalog size.

## Production CSS and JavaScript

Run `npm ci` before building or testing. The lockfile pins the build-only [esbuild 0.28.2 package](https://registry.npmjs.org/esbuild/0.28.2), including its platform-specific optional binaries. CI installs it before the existing regression, static-build and syntax checks; Vercel installs dependencies during its build. `node_modules/` is excluded from source control and direct deployment uploads.

The builder uses esbuild's per-file [transform API](https://esbuild.github.io/api/#transform) with syntax and whitespace [minification](https://esbuild.github.io/api/#minify). It keeps the same URLs and file boundaries, so the templates' blocking stylesheet order and classic-script global callbacks are preserved. Identifier and property mangling, bundling, tree shaking and source maps are disabled. License/preservation comments remain inline. CSS is not purged using page coverage, and layout stylesheets are not deferred.

JavaScript targets ES2020, which matches syntax already present in the sources. CSS transforms are constrained to Chrome/Edge 90, Firefox 88 and Safari 14. These [targets](https://esbuild.github.io/api/#target) govern compiler syntax transformations; they do not polyfill browser APIs, validate every existing CSS feature, or certify those browsers. A browser-specific JavaScript target also requests Safari destructuring bug workarounds that esbuild cannot perform, so it is deliberately not used for this minification step.

Source files remain readable and unchanged. The server renderer continues to load the original `app.js`, `detail.js` and `seo-core.js`; its dependency graph and `includeFiles` do not include the minifier or generated client scripts. All code transforms must complete without parser warnings before the builder writes the ownership manifest or assets. Existing output guards still preserve unexpected files and symlinks, and no output directory is recursively deleted.

`npm run dev` serves source assets. To inspect the built output with the same server renderer, run `npm run build:static` and then `node scripts/dev-server.cjs --production-assets`; the `--production-assets` preview serves allowlisted assets from `public/`. Test both a mobile and desktop viewport after substantive stylesheet/compiler changes, and repeat production HTTP checks after deployment. VM and CSS invariant checks do not replace browser layout checks.

The October 1, 2026 build emitted 8 CSS files totaling 121,576 bytes from 186,421 source bytes, and 14 JavaScript files totaling 166,090 bytes from 210,565 source bytes: 109,320 bytes saved across the allowlist (27.5%). Summed per-file gzip estimates fell from 86,068 to 69,746 bytes (16,322 saved, 19.0%). These are full asset-inventory measurements, including files that a particular page does not load, and gzip estimates rather than an observed production transfer size. Later source changes can alter the totals.

Regression checks compare original and generated catalog/detail renderer HTML, exercise global navigation/consent and episode callbacks, parse classic and module scripts in their original modes, verify responsive portrait-card rules and stylesheet order, and inspect the API dependency graph in a fresh process. Source hashes and repeat-build hashes confirm originals are preserved and generated output is deterministic. A simulated input parse error verifies that previously generated assets and ownership metadata remain untouched.

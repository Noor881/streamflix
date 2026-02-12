// Build-time Workbox script (requires workbox-build)
const workboxBuild = require('workbox-build');
const path = require('path');

const swDest = path.join(__dirname, '..', 'sw.workbox.js');

workboxBuild.generateSW({
  swDest,
  globDirectory: path.join(__dirname, '..'),
  globPatterns: [
    'index.html',
    'styles.css',
    'app.js',
    'scripts/**',
    'images/**',
    'offline.html'
  ],
  runtimeCaching: [
    {
      urlPattern: /https:\/\/image.tmdb.org\//,
      handler: 'CacheFirst',
      options: { cacheName: 'tmdb-images', expiration: { maxEntries: 200 } }
    },
    {
      urlPattern: /\/api\//,
      handler: 'NetworkFirst',
      options: { cacheName: 'api-cache', networkTimeoutSeconds: 3 }
    }
  ],
  skipWaiting: true,
  clientsClaim: true
}).then(({count, size, warnings})=>{
  warnings.forEach(console.warn);
  console.log(`Generated ${swDest}, which will precache ${count} files, ${size} bytes.`);
}).catch(err=>{ console.error(err); process.exit(1); });

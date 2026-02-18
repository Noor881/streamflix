#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SITEMAP = path.resolve(__dirname, '..', 'sitemap.xml');
if (!fs.existsSync(SITEMAP)) {
  console.error('sitemap.xml not found at', SITEMAP);
  process.exit(2);
}

let xml = fs.readFileSync(SITEMAP, 'utf8');
let removed = 0;

// Process each <url>...</url> block independently
xml = xml.replace(/<url>([\s\S]*?)<\/url>/g, (match) => {
  const block = match;
  const locMatch = block.match(/<loc>([\s\S]*?)<\/loc>/);
  if (!locMatch) return match;
  const loc = locMatch[1].trim();

  // Remove any video:content_loc or video:player_loc equal to the page loc
  const cleaned = block.replace(/<video:(content_loc|player_loc)>([\s\S]*?)<\/video:\1>/g, (m, tag, val) => {
    if (val.trim() === loc) {
      removed++;
      return '';
    }
    return m; // keep if different
  });

  return cleaned;
});

if (removed > 0) {
  fs.writeFileSync(SITEMAP, xml, 'utf8');
  console.log(`Removed ${removed} invalid video tag(s) from sitemap.xml`);
} else {
  console.log('No invalid video tags found; sitemap unchanged.');
}

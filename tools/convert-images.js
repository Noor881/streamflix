// Simple image conversion script using sharp
// Usage: node tools/convert-images.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const srcDir = path.join(__dirname, '..', 'images');
const outDir = path.join(srcDir, 'converted');

if (!fs.existsSync(srcDir)) {
  console.error('No images directory found at', srcDir);
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(srcDir).filter(f => /\.(jpe?g|png)$/i.test(f));
if (!files.length) {
  console.log('No JPG/PNG files to convert in', srcDir);
  process.exit(0);
}

Promise.all(files.map(file => {
  const input = path.join(srcDir, file);
  const name = path.basename(file, path.extname(file));
  return Promise.all([
    sharp(input).webp({ quality: 80 }).toFile(path.join(outDir, `${name}.webp`)),
    sharp(input).avif({ quality: 50 }).toFile(path.join(outDir, `${name}.avif`))
  ]).then(()=> console.log('Converted', file)).catch(err=>console.error('Error converting', file, err));
})).then(()=>console.log('Done'));

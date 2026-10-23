#!/usr/bin/env node
/* Converts source photography into optimised WebP sizes.
     assets/img/src/*.jpg → assets/img/<name>-{400,800,1200,1600}.webp (only sizes ≤ source width)
   Writes data/_image-dims.json (width/height per size, used by the build for width/height attrs)
   and assets/img/og-default.jpg (1200×630).
   Uses sharp if installed, otherwise Python/Pillow. Run: npm run images */
'use strict';
const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const root = path.join(__dirname, '..');
const SRC = path.join(root, 'assets/img/src'); const OUT = path.join(root, 'assets/img');
let sharp = null; try { sharp = require('sharp'); } catch (e) {}
const dimsPath = path.join(root, 'data/_image-dims.json');
const dims = {};

async function convert(f, out, w, q) {
  if (sharp) {
    await sharp(f).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: q, effort: 6 }).toFile(out);
    const m = await sharp(out).metadata(); return [m.width, m.height];
  }
  return cp.execFileSync('python3', ['-I', '-c', `
from PIL import Image, ImageOps; import sys
im=ImageOps.exif_transpose(Image.open(sys.argv[1])).convert('RGB'); w=int(sys.argv[3])
if im.width>w: im=im.resize((w, round(im.height*w/im.width)), Image.LANCZOS)
im.save(sys.argv[2],'WEBP',quality=int(sys.argv[4]),method=6); print(im.width, im.height)`, f, out, String(w), String(q)]).toString().trim().split(' ').map(Number);
}
function srcSize(f) {
  return cp.execFileSync('python3', ['-I', '-c', `from PIL import Image; import sys; im=Image.open(sys.argv[1]); print(im.width, im.height)`, f]).toString().trim().split(' ').map(Number);
}
(async () => {
  let n = 0;
  for (const f of fs.readdirSync(SRC)) {
    if (!/\.(jpe?g|png)$/i.test(f)) continue;
    const base = f.replace(/\.(jpe?g|png)$/i, '');
    const [sw] = srcSize(path.join(SRC, f));
    dims[base] = {};
    for (const w of [1600, 1200, 800, 400]) {
      if (w > sw && w !== 400) continue; // never upscale; 400 always exists
      const out = path.join(OUT, `${base}-${w}.webp`);
      const [cw, ch] = await convert(path.join(SRC, f), out, w, w >= 1600 ? 74 : (w === 800 ? 72 : 70));
      dims[base][w] = [cw, ch];
    }
    n++;
  }
  fs.writeFileSync(dimsPath, JSON.stringify(dims, null, 0) + '\n');
  // OG default image 1200×630 from the landscaping photo
  const og = path.join(SRC, 'landscaping.jpg');
  if (fs.existsSync(og)) {
    cp.execFileSync('python3', ['-I', '-c', `from PIL import Image, ImageOps; import sys; ImageOps.fit(Image.open(sys.argv[1]).convert('RGB'),(1200,630)).save(sys.argv[2],quality=80)`, og, path.join(OUT, 'og-default.jpg')]);
  }
  console.log(`converted ${n} source images; dims → data/_image-dims.json`);
})();

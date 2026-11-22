// Generates the app icons (PNG + SVG) without any image library:
// a court-green square with a tennis ball and its seam.
// Run: npm run icons
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const BG = [15, 81, 50];      // #0f5132
const BALL = [212, 232, 58];  // tennis-ball yellow
const SEAM = [255, 255, 255];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x + 0.5, y + 0.5, size);
      raw[o++] = r; raw[o++] = g; raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const cover = (d, aa) => Math.min(1, Math.max(0, 0.5 - d / aa)); // signed distance -> coverage

function pixel(x, y, size) {
  const c = size / 2;
  const R = size * 0.32;          // ball radius (inside maskable safe zone)
  const aa = Math.max(1, size / 256);
  const dx = x - c, dy = y - c;
  const dBall = Math.hypot(dx, dy) - R;
  let col = mix(BG, BALL, cover(dBall, aa));
  if (dBall < 0) {
    // two seam arcs: circles centred off to the left and right of the ball
    const off = R * 1.35, sr = R * 0.95, w = size * 0.018;
    const d1 = Math.abs(Math.hypot(x - (c - off), dy) - sr) - w;
    const d2 = Math.abs(Math.hypot(x - (c + off), dy) - sr) - w;
    col = mix(col, SEAM, cover(Math.min(d1, d2), aa));
  }
  return col;
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(name, OUT), png(size, pixel));
}

writeFileSync(new URL('favicon.svg', OUT), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="20" fill="#0f5132"/>
<clipPath id="b"><circle cx="50" cy="50" r="32"/></clipPath>
<circle cx="50" cy="50" r="32" fill="#d4e83a"/>
<g clip-path="url(#b)" fill="none" stroke="#fff" stroke-width="3.6">
<circle cx="6.8" cy="50" r="30.4"/><circle cx="93.2" cy="50" r="30.4"/></g>
</svg>
`);
console.log('icons written to public/');

// Tray-/Fenster-Icon ohne Bilddatei: ein kleines gruenes Blubb-Gesicht als PNG im Speicher.
const zlib = require('node:zlib');

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function iconPng(size = 32) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 32;
  const set = (x, y, [r, g, b, a]) => { const i = (y * size + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a; };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / s, fy = y / s;
      // Koerper: Ellipse, unten flach
      const e = ((fx - 16) / 14.5) ** 2 + ((fy - 17) / 13.5) ** 2;
      if (e > 1) continue;
      let col = [93, 196, 144, 255];
      if (e > 0.84) col = [52, 140, 98, 255]; // Rand
      const md = Math.hypot(fx - 16, fy - 19.5);
      if (fy > 21 && md > 3.2 && md < 4.4 && Math.abs(fx - 16) < 3.6) col = [30, 41, 59, 255]; // Laecheln
      if (((fx - 11) / 2.2) ** 2 + ((fy - 17) / 3) ** 2 <= 1 || ((fx - 21) / 2.2) ** 2 + ((fy - 17) / 3) ** 2 <= 1) col = [30, 41, 59, 255]; // Augen
      if (((fx - 10.4) / 0.9) ** 2 + ((fy - 15.8) / 0.9) ** 2 <= 1 || ((fx - 20.4) / 0.9) ** 2 + ((fy - 15.8) / 0.9) ** 2 <= 1) col = [255, 255, 255, 255];
      if (((fx - 7) / 2) ** 2 + ((fy - 22) / 1.2) ** 2 <= 1 || ((fx - 25) / 2) ** 2 + ((fy - 22) / 1.2) ** 2 <= 1) col = [244, 143, 177, 255]; // Baeckchen
      set(x, y, col);
    }
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { iconPng };

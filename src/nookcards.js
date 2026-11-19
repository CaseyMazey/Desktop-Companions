// Karteikarten aus Nook lesen (fuer Huhus Quiz). Nook speichert seine Daten im localStorage seiner Desktop-App,
// also in einer LevelDB von Chromium: %APPDATA%\Nook\Local Storage\leveldb. Hier wird NUR GELESEN – nie geschrieben,
// nie gesperrt –, damit Nooks Daten nicht beschaedigt werden koennen, auch wenn Nook gerade laeuft.
// Ohne Abhaengigkeiten: kleine LevelDB-Leser fuer Log (.log) und Tabellen (.ldb, Bloecke ggf. Snappy-komprimiert).
const fs = require('node:fs');
const path = require('node:path');

// ---------- Snappy (nur Entpacken) ----------
function snappyDecompress(buf) {
  let pos = 0;
  let len = 0;
  for (let shift = 0; ; shift += 7) { const b = buf[pos++]; len |= (b & 0x7f) << shift; if (b < 0x80) break; }
  const out = Buffer.alloc(len);
  let o = 0;
  while (pos < buf.length) {
    const tag = buf[pos++];
    const type = tag & 3;
    if (type === 0) { // Literal
      let n = tag >> 2;
      if (n >= 60) { const bytes = n - 59; n = 0; for (let i = 0; i < bytes; i++) n |= buf[pos++] << (8 * i); }
      n += 1;
      buf.copy(out, o, pos, pos + n); o += n; pos += n;
    } else { // Kopie aus dem schon Entpackten
      let n; let off;
      if (type === 1) { n = ((tag >> 2) & 7) + 4; off = ((tag >> 5) << 8) | buf[pos++]; }
      else if (type === 2) { n = (tag >> 2) + 1; off = buf.readUInt16LE(pos); pos += 2; }
      else { n = (tag >> 2) + 1; off = buf.readUInt32LE(pos); pos += 4; }
      for (let i = 0; i < n; i++) { out[o] = out[o - off]; o++; }
    }
  }
  return out;
}

const varint = (buf, pos) => { let v = 0; let shift = 0; let b; do { b = buf[pos++]; v += (b & 0x7f) * 2 ** shift; shift += 7; } while (b >= 0x80); return [v, pos]; };

// ---------- Tabellen (.ldb) ----------
function readBlock(file, offset, size) {
  const raw = file.subarray(offset, offset + size);
  return file[offset + size] === 1 ? snappyDecompress(raw) : raw; // Typ-Byte nach dem Block: 0 = roh, 1 = Snappy
}
function blockEntries(block) {
  const restarts = block.readUInt32LE(block.length - 4);
  const end = block.length - 4 - restarts * 4;
  const out = [];
  let pos = 0;
  let key = Buffer.alloc(0);
  while (pos < end) {
    let shared; let nonShared; let vlen;
    [shared, pos] = varint(block, pos); [nonShared, pos] = varint(block, pos); [vlen, pos] = varint(block, pos);
    key = Buffer.concat([key.subarray(0, shared), block.subarray(pos, pos + nonShared)]); pos += nonShared;
    out.push([key, block.subarray(pos, pos + vlen)]); pos += vlen;
  }
  return out;
}
function* tableEntries(file) {
  const footer = file.subarray(file.length - 48);
  let p = 0; let o; let s;
  [o, p] = varint(footer, p); [s, p] = varint(footer, p); // Metaindex (nicht gebraucht)
  [o, p] = varint(footer, p); [s, p] = varint(footer, p);
  for (const [, handle] of blockEntries(readBlock(file, o, s))) {
    const [bo, q] = varint(handle, 0); const [bs] = varint(handle, q);
    for (const [ikey, value] of blockEntries(readBlock(file, bo, bs))) {
      const tail = ikey.subarray(ikey.length - 8);
      yield { key: ikey.subarray(0, ikey.length - 8), seq: Number(tail.readBigUInt64LE(0) >> 8n), put: tail[0] === 1, value };
    }
  }
}

// ---------- Log (.log): Saetze aus 32-KB-Bloecken zusammensetzen, darin WriteBatches ----------
function* logEntries(file) {
  let pos = 0;
  let rec = [];
  while (pos + 7 <= file.length) {
    const blockLeft = 32768 - (pos % 32768);
    if (blockLeft < 7) { pos += blockLeft; continue; }
    const len = file.readUInt16LE(pos + 4); const type = file[pos + 6];
    if (type === 0 && len === 0) { pos += blockLeft; continue; }
    rec.push(file.subarray(pos + 7, pos + 7 + len));
    pos += 7 + len;
    if (type === 1 || type === 4) { // FULL oder LAST: ein Satz ist komplett
      const batch = Buffer.concat(rec); rec = [];
      if (batch.length < 12) continue;
      let seq = Number(batch.readBigUInt64LE(0)); const count = batch.readUInt32LE(8);
      let q = 12;
      for (let i = 0; i < count && q < batch.length; i++, seq++) {
        const tag = batch[q++]; let kl; let vl;
        [kl, q] = varint(batch, q); const key = batch.subarray(q, q + kl); q += kl;
        if (tag === 1) { [vl, q] = varint(batch, q); yield { key, seq, put: true, value: batch.subarray(q, q + vl) }; q += vl; }
        else yield { key, seq, put: false, value: null };
      }
    }
  }
}

// Neuester Wert eines Schluessels in einer LevelDB (null, wenn nicht da oder geloescht)
function readValue(dir, key) {
  const want = Buffer.from(key, 'latin1');
  let best = null;
  for (const name of fs.readdirSync(dir)) {
    const ext = path.extname(name);
    if (ext !== '.ldb' && ext !== '.log') continue;
    let file;
    try { file = fs.readFileSync(path.join(dir, name)); } catch { continue; }
    try {
      for (const e of (ext === '.ldb' ? tableEntries(file) : logEntries(file))) {
        if (e.key.equals(want) && (!best || e.seq > best.seq)) best = e;
      }
    } catch { /* halb geschriebene Datei: ueberspringen */ }
  }
  return best && best.put ? best.value : null;
}

// Chromium speichert localStorage-Werte mit einem Vorzeichen: 0 = UTF-16LE, 1 = Latin-1
const decodeLocalStorage = (v) => (v[0] === 0 ? v.subarray(1).toString('utf16le') : v.subarray(1).toString('latin1'));

// Karten aus Nooks "subjects" (Faecher -> Gruppen -> Karten mit front/back), Archiviertes weggelassen
function cardsFromSubjects(subjects) {
  const out = [];
  for (const s of Array.isArray(subjects) ? subjects : []) {
    if (!s || s.archived) continue;
    for (const g of Array.isArray(s.groups) ? s.groups : []) {
      for (const c of Array.isArray(g && g.cards) ? g.cards : []) {
        const q = typeof c.front === 'string' ? c.front.trim() : '';
        const a = typeof c.back === 'string' ? c.back.trim() : '';
        if (q && a && !c.archived) out.push({ q: q.slice(0, 160), a: a.slice(0, 220), subject: String(s.name || '').slice(0, 40) });
      }
    }
  }
  return out;
}

// Nooks Karteikarten laden; dir = Nooks Benutzerdatenordner (z. B. %APPDATA%\Nook)
function loadNookCards(nookDir) {
  const db = path.join(nookDir, 'Local Storage', 'leveldb');
  if (!fs.existsSync(db)) return [];
  const v = readValue(db, '_app://nook\u0000\u0001subjects');
  if (!v) return [];
  try { return cardsFromSubjects(JSON.parse(decodeLocalStorage(v))); } catch { return []; }
}

module.exports = { loadNookCards, cardsFromSubjects, snappyDecompress, readValue, decodeLocalStorage };

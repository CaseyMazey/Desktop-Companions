// Kleiner lokaler Empfaenger fuer Meldungen anderer Apps (nur 127.0.0.1).
//   POST http://127.0.0.1:47811/event   Content-Type: application/json
//   POST http://127.0.0.1:47811/hook/claude-code   rohe Hook-Daten von Claude Code (siehe claudehook.js)
//   { "app": "nexus" | "dan" | "nook" | "custom" | "claude-code" | …, "type": "task-done" | "task-error" | "decision" | "say", "text"?: "...", "project"?: "...", "pet"?: "<id>" }
// Nur JSON wird angenommen: Webseiten im Browser koennen so ohne CORS-Freigabe nichts schicken.
const http = require('node:http');
const { eventFromHook, MARK } = require('./claudehook');

const PORT = Number(process.env.PETS_PORT) || 47811;
const TYPES = new Set(['task-done', 'task-error', 'decision', 'say']);

function validEvent(e) {
  if (!e || typeof e !== 'object') return null;
  if (!TYPES.has(e.type)) return null;
  const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const out = { app: s(e.app, 20).toLowerCase(), type: e.type, text: s(e.text, 200), project: s(e.project, 80), tool: s(e.tool, 60), pet: s(e.pet, 16) };
  if (!out.app && !out.pet) return null;
  if (out.type === 'say' && !out.text) return null;
  out.seconds = Number.isFinite(e.seconds) ? Math.max(0, Math.round(e.seconds)) : 0;
  return out;
}

function startBridge(onEvent, log = console.log, port = PORT) {
  const server = http.createServer((req, res) => {
    const host = String(req.headers.host || '');
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) { res.writeHead(403).end(); return; }
    if (req.method === 'GET' && req.url === '/ping') { res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"pets":true}'); return; }
    // /hook/claude-code: die rohen Hook-Daten von Claude Code (Stop, Notification) – siehe claudehook.js
    const isHook = req.url === MARK;
    if (req.method !== 'POST' || (req.url !== '/event' && !isHook)) { res.writeHead(404).end(); return; }
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) { res.writeHead(415).end(); return; }
    let body = '';
    const max = isHook ? 262144 : 8192; // Hook-Daten koennen laenger sein (z. B. die letzte Antwort)
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > max) { res.writeHead(413).end(); req.destroy(); } });
    req.on('end', () => {
      if (res.writableEnded) return;
      let ev = null;
      try {
        let data;
        // Hook-Daten: einzelne Backslashes (Windows-Pfade, falls eine Shell sie verschluckt hat) zur Not reparieren
        try { data = JSON.parse(body); } catch (e) { if (!isHook) throw e; data = JSON.parse(body.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')); }
        if (isHook) {
          const raw = eventFromHook(data);
          if (!raw) { res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"delivered":0}'); return; }
          ev = validEvent(raw);
        } else ev = validEvent(data);
      } catch { /* kaputtes JSON */ }
      if (!ev) { res.writeHead(400).end(); return; }
      const n = onEvent(ev);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ delivered: n || 0 }));
    });
  });
  server.on('error', (e) => log('[bridge]', e.code === 'EADDRINUSE' ? `Port ${port} ist belegt – Meldungen anderer Apps kommen nicht an.` : e.message));
  server.listen(port, '127.0.0.1');
  return server;
}

module.exports = { startBridge, validEvent, PORT };

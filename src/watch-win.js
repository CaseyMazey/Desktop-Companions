// Buhs Talent "Diskret" unter Windows: erkennt Meetings (Mikrofon oder Kamera gerade in Benutzung) und Vollbild
// (Fenster im Vordergrund bedeckt den ganzen Bildschirm). Ein einziger PowerShell-Prozess im Hintergrund meldet
// alle 3 Sekunden eine Zeile JSON: {"mic":false,"cam":false,"full":false}. Nur gestartet, solange es Buh braucht.
// Windows merkt sich je App, wann Mikrofon/Kamera zuletzt benutzt wurden; LastUsedTimeStop = 0 heisst "laeuft gerade".
const { spawn } = require('node:child_process');

const SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Runtime.InteropServices;
public class DcFg {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MI { public int cb; public RECT M; public RECT W; public int F; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, int f);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MI i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  // Echtes Vollbild (Video, Praesentation, Spiel, F11) – NICHT ein maximiertes Fenster: Auf Monitoren ohne Taskleiste
  // fuellt auch ein maximiertes Fenster den ganzen Bildschirm. Gibt das Monitor-Rechteck zurueck ("x,y,r,b") oder "".
  public static string Full() { return FullOf(GetForegroundWindow()); }
  public static string FullOf(IntPtr h) {
    if (h == IntPtr.Zero) return "";
    StringBuilder sb = new StringBuilder(64); GetClassName(h, sb, 64); string c = sb.ToString();
    if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd") return "";
    if (IsZoomed(h)) return "";                                 // maximiert = kein Vollbild (auch ohne Taskleiste)
    RECT r; if (!GetWindowRect(h, out r)) return "";
    MI mi = new MI(); mi.cb = Marshal.SizeOf(typeof(MI));
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return "";
    if (r.L <= mi.M.L && r.T <= mi.M.T && r.R >= mi.M.R && r.B >= mi.M.B) return mi.M.L + "," + mi.M.T + "," + mi.M.R + "," + mi.M.B + "," + c;
    return "";
  }
}
"@
function InUse($cap) {
  $base = "HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\$cap"
  foreach ($k in (Get-ChildItem $base -Recurse)) {
    $p = Get-ItemProperty $k.PSPath
    if ($p.LastUsedTimeStart -gt 0 -and $p.LastUsedTimeStop -eq 0) { return $true }
  }
  return $false
}
while ($true) {
  $o = @{ mic = [bool](InUse 'microphone'); cam = [bool](InUse 'webcam'); full = [string][DcFg]::Full() }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  Start-Sleep -Seconds 3
}
`;

// "x,y,r,b" (Bildschirm-Pixel) -> { x, y, w, h } oder null (kein Vollbild)
function parseRect(v) {
  const parts = String(v || '').split(',');
  const n = parts.slice(0, 4).map(Number);
  if (!(n.length === 4 && n.every(Number.isFinite) && n[2] > n[0] && n[3] > n[1])) return null;
  return { x: n[0], y: n[1], w: n[2] - n[0], h: n[3] - n[1], cls: parts.slice(4).join(',').slice(0, 80) };
}

// Startet den Waechter; onState({ mic, cam, full }) bei jeder Aenderung (full = Monitor mit Vollbild oder null). Gibt eine Stopp-Funktion zurueck.
function startWatch(onState, log = () => {}) {
  if (process.platform !== 'win32') return () => {};
  let child = null;
  let stopped = false;
  let restarts = 0;
  let last = '';
  const run = () => {
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true });
    let buf = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('{') || line === last) continue;
        last = line;
        try { const s = JSON.parse(line); onState({ mic: !!s.mic, cam: !!s.cam, full: parseRect(s.full) }); } catch { /* halbe Zeile */ }
      }
    });
    child.on('error', (e) => log('[diskret]', e.message));
    child.on('exit', () => {
      child = null;
      if (!stopped && restarts++ < 5) setTimeout(run, 5000); // abgestuerzt: ein paar Mal neu starten
    });
  };
  run();
  return () => { stopped = true; if (child) child.kill(); };
}

module.exports = { startWatch, parseRect, SCRIPT };

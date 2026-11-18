// Automatische Updates wie bei NEXUS: fragt GitHub Releases (CaseyMazey/Desktop-Companions) nach einer neueren
// Version, laedt sie im Hintergrund und bietet "Jetzt neu starten" an. Sonst wird beim Beenden installiert.
// Nur in der installierten App aktiv; aus dem Quellcode oder im Rauchtest passiert nichts.
const CHECK_EVERY = 6 * 60 * 60 * 1000; // alle 6 Stunden
const FIRST_CHECK = 15 * 1000;          // kurz nach dem Start

// Selbst installieren geht unter Windows und mit dem Linux-AppImage. macOS-Apps ohne Apple-Signatur
// koennen sich nicht selbst ersetzen, die .deb-Installation auch nicht: dort gibt es nur einen Hinweis
// mit Link zur Download-Seite.
const canSelfInstall = (platform = process.platform, env = process.env) => platform === 'win32' || (platform === 'linux' && !!env.APPIMAGE);

// Zustand: idle | checking | none | available (nur Hinweis) | downloading | ready | error | off
class Updater {
  constructor({ enabled, releasesUrl, isEnabledSetting = () => true, onState = () => {}, log = console.log, selfInstall = canSelfInstall(), openUrl = null }) {
    Object.assign(this, { enabled, releasesUrl, isEnabledSetting, onState, log, selfInstall });
    this.openUrl = openUrl || ((u) => require('electron').shell.openExternal(u));
    this.state = { status: enabled ? 'idle' : 'off' };
    this.au = null;
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }

  start() {
    if (!this.enabled) return;
    const { autoUpdater } = require('electron-updater');
    this.au = autoUpdater;
    autoUpdater.autoDownload = this.selfInstall;
    autoUpdater.autoInstallOnAppQuit = this.selfInstall;
    autoUpdater.logger = { info: (m) => this.log('[update]', m), warn: (m) => this.log('[update]', m), error: (m) => this.log('[update]', m), debug: () => {} };
    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking' }));
    autoUpdater.on('update-not-available', () => this.set({ status: 'none', checkedAt: Date.now() }));
    autoUpdater.on('update-available', (info) => this.set(this.selfInstall ? { status: 'downloading', version: info.version, percent: 0 } : { status: 'available', version: info.version }));
    autoUpdater.on('download-progress', (p) => this.set({ status: 'downloading', percent: Math.round(p.percent || 0) }));
    autoUpdater.on('update-downloaded', (info) => this.set({ status: 'ready', version: info.version }));
    autoUpdater.on('error', (err) => this.set({ status: 'error', error: String((err && err.message) || err).slice(0, 300) }));
    setTimeout(() => this.check(false), FIRST_CHECK);
    this.timer = setInterval(() => this.check(false), CHECK_EVERY);
  }

  // manual = vom Nutzer angestossen (auch wenn automatische Updates ausgeschaltet sind)
  async check(manual) {
    if (!this.au) return this.state;
    if (!manual && !this.isEnabledSetting()) return this.state;
    if (['downloading', 'ready', 'checking', 'available'].includes(this.state.status)) return this.state;
    try { await this.au.checkForUpdates(); } catch (e) { this.set({ status: 'error', error: String(e.message || e).slice(0, 300) }); }
    return this.state;
  }

  // Neu starten und installieren (still, danach startet die App wieder); bei "nur Hinweis" die Download-Seite
  install() {
    if (this.state.status === 'available') { this.openUrl(this.releasesUrl); return; }
    if (this.au && this.state.status === 'ready') this.au.quitAndInstall(true, true);
  }
}

module.exports = { Updater, canSelfInstall };

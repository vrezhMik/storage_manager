// Flexit for Windows: the terminal in its own window. Requests that must come
// from this computer (its own IP), e.g. to the tax service, are made here in
// the main process through window.flexitNative.request() (see preload.js).
const { app, BrowserWindow, ipcMain, shell, Menu } = require("electron");

const TERMINAL_URL = process.env.FLEXIT_URL || "https://terminal.flexit.am";

// Pages that may use the bridge.
const TRUSTED_ORIGINS = new Set([
  new URL(TERMINAL_URL).origin,
  "https://terminal.flexit.am",
  "http://terminal.loc",
  "http://localhost:3000",
]);

// Hosts the bridge may call: the tax service, plus extra hosts (e.g. the 1C
// server) listed in FLEXIT_ALLOWED_HOSTS, comma separated.
const ALLOWED_HOSTS = [/(^|\.)taxservice\.am$/i];
const extraHosts = (process.env.FLEXIT_ALLOWED_HOSTS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

const hostAllowed = (url) => {
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((re) => re.test(host)) || extraHosts.includes(host);
};

ipcMain.handle("flexit-native-request", async (event, spec) => {
  const origin = new URL(event.senderFrame.url).origin;
  if (!TRUSTED_ORIGINS.has(origin)) throw new Error("This page may not make device requests");

  const url = new URL(String(spec?.url || ""));
  if (!/^https?:$/.test(url.protocol) || !hostAllowed(url)) throw new Error(`Host not allowed: ${url.hostname}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Number(spec.timeoutMs) || 30000, 120000));
  try {
    const res = await fetch(url, {
      method: spec.method || "GET",
      headers: spec.headers || {},
      body: spec.body ?? undefined,
      signal: controller.signal,
    });
    return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: await res.text() };
  } catch (err) {
    throw new Error(err?.name === "AbortError" ? "Request timed out" : String(err?.message || err));
  } finally {
    clearTimeout(timer);
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Flexit",
    icon: __dirname + "/icon.png",
    autoHideMenuBar: true,
    webPreferences: {
      preload: __dirname + "/preload.js",
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Links to other sites open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!TRUSTED_ORIGINS.has(new URL(url).origin)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  win.loadURL(TERMINAL_URL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  Menu.setApplicationMenu(null);
  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => app.quit());
}

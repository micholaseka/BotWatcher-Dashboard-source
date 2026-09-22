// electron/main.mjs
//
// Electron main process: React UI <-> AccountRotator.
// React tidak menjalankan Playwright langsung.

import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { AccountManager } from "../src/accounts/accountManager.js";
import { AccountRotator } from "../src/rotation/accountRotator.js";
import { MarketplaceSession } from "../src/marketplace/session.js";
import { TelegramNotifier } from "../src/notifications/telegram.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

let mainWindow = null;
let rotator = null;

const manager = new AccountManager();
const notifier = new TelegramNotifier();
const replySessions = new Map(); // accountId -> MarketplaceSession aktif buat reply manual

let rotationState = {
  round: 0,
  currentBatch: [],
  checkedSoFar: 0,
  totalAccounts: 0,
};

function broadcastStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("accounts:update", manager.getAllStatuses());
}

function broadcastLog(message, level = "info") {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("engine:log", {
    message,
    level,
    at: new Date().toISOString(),
  });
}

function broadcastRotation() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("rotation:update", rotationState);
}

function broadcastEngineStatus(running) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("engine:status", { running });
}

function createRotator() {
  const accountIds = manager.getEnabledAccounts().map((a) => a.accountId);

  const r = new AccountRotator(accountIds, {
    minBatchSize: 5,
    maxBatchSize: 10,
    delayBetweenBatchesMs: 5000,
    roundIntervalMs: 15 * 60 * 1000,
  });

  r.on("log", (message, level) => broadcastLog(message, level));

  r.on("round_started", ({ round, totalAccounts }) => {
    rotationState = { round, currentBatch: [], checkedSoFar: 0, totalAccounts };
    broadcastRotation();
  });

  r.on("batch_started", ({ batch, checkedSoFar, totalAccounts }) => {
    rotationState = {
      ...rotationState,
      currentBatch: batch,
      checkedSoFar,
      totalAccounts,
    };
    broadcastRotation();
  });

  r.on("batch_finished", ({ checkedSoFar, totalAccounts }) => {
    rotationState = {
      ...rotationState,
      currentBatch: [],
      checkedSoFar,
      totalAccounts,
    };
    broadcastRotation();
  });

  r.on("account_checked", ({ accountId, loggedIn, unreadCount }) => {
    manager.updateStatus(accountId, {
      loggedIn,
      unreadCount,
      lastCheckedAt: new Date(),
      state: loggedIn ? "monitoring" : "offline",
      error: null,
    });
    broadcastStatus();

    if (loggedIn && unreadCount > 0) {
      const account = manager.getAccount(accountId);
      notifier.notifyUnread(account?.name ?? accountId, unreadCount);
    }
  });

  r.on("error", ({ accountId, error }) => {
    manager.updateStatus(accountId, { state: "error", error: error.message });
    broadcastStatus();
    broadcastLog(`[${accountId}] ${error.message}`, "error");
  });

  return r;
}

// --- IPC handlers dipanggil dari renderer (GUI) ---

ipcMain.handle("accounts:getAll", () => manager.getAllStatuses());
ipcMain.handle("engine:getStatus", () => ({
  running: Boolean(rotator?.running),
}));
ipcMain.handle("rotation:getState", () => rotationState);

ipcMain.handle("engine:start", async () => {
  if (!manager.loaded) await manager.load();
  if (rotator?.running) return { running: true };

  rotator = createRotator();
  broadcastLog(
    `Rotasi dimulai untuk ${manager.getEnabledAccounts().length} akun aktif.`,
    "info",
  );
  broadcastEngineStatus(true);

  rotator.start().finally(() => broadcastEngineStatus(false));

  return { running: true };
});

ipcMain.handle("engine:stop", async () => {
  if (rotator) rotator.stop();
  broadcastLog("Perintah stop diterima.", "info");
  return { running: false };
});

ipcMain.handle("accounts:remove", async (_event, accountId) => {
  await manager.removeAccount(accountId);

  broadcastStatus();

  return manager.getAllStatuses();
});

// Simpan perubahan nama/kota (dipanggil dari kartu akun yang di-klik-edit).
ipcMain.handle("accounts:update", async (_event, { accountId, updates }) => {
  await manager.updateAccount(accountId, updates);
  broadcastStatus();
  return manager.getAllStatuses();
});

// Tombol "Balas Sekarang" -- buka (atau fokus ulang) sesi browser buat
// akun itu, terpisah dari siklus rotasi otomatis, biar user bisa balas
// manual.
ipcMain.handle("accounts:openReply", async (_event, accountId) => {
  const account = manager.getAccount(accountId);
  if (!account) throw new Error(`Akun "${accountId}" tidak ditemukan.`);

  const existing = replySessions.get(accountId);
  if (existing) {
    try {
      await existing.page?.bringToFront();
      return { opened: true, reused: true };
    } catch {
      replySessions.delete(accountId);
    }
  }

  const session = new MarketplaceSession({ accountId });
  session.on("log", (message, level) =>
    broadcastLog(`[balas:${accountId}] ${message}`, level),
  );

  await session.open();
  session.context?.on("close", () => replySessions.delete(accountId));
  replySessions.set(accountId, session);

  return { opened: true, reused: false };
});

// --- Setup jendela ---

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "..", "ui-design", "dist", "index.html"),
    );
  }
}

app.whenReady().then(async () => {
  createWindow();

  try {
    await manager.load();
    broadcastStatus();
    broadcastLog("Aplikasi siap. Bot belum dimulai.", "info");
    broadcastEngineStatus(false);
  } catch (err) {
    broadcastLog(`Gagal memuat accounts.json: ${err.message}`, "error");
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  if (rotator) rotator.stop();
  for (const session of replySessions.values()) {
    await session.close().catch(() => {});
  }
  replySessions.clear();
  if (process.platform !== "darwin") app.quit();
});

// electron/main.mjs
//
// Electron main process: React UI <-> AccountRotator.
// React tidak menjalankan Playwright langsung.

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "fs/promises";
import { parseProxyCsv } from "../src/proxy/proxyCsv.js";
import path from "path";
import { fileURLToPath } from "url";
import { AccountManager } from "../src/accounts/accountManager.js";
import { AccountRotator } from "../src/rotation/accountRotator.js";
import { MarketplaceSession } from "../src/marketplace/session.js";
import { TelegramNotifier } from "../src/notifications/telegram.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const isAccountManagerSmokeTest = process.argv.includes(
  "--smoke-test-account-manager",
);

let mainWindow = null;
let rotator = null;
let manager = null;
let managerInitPromise = null;
let managerInitError = null;

async function initializeManager() {
  if (manager) return manager;
  if (managerInitPromise) return managerInitPromise;

  managerInitPromise = (async () => {
    const dataRoot = app.getPath("userData");
    process.env.BOTWATCHER_DATA_DIR = dataRoot;

    const instance = new AccountManager({
      databaseFile: path.join(dataRoot, "botwatcher.db"),
    });

    await instance.load();

    manager = instance;
    managerInitError = null;

    return manager;
  })().catch((error) => {
    managerInitError = error;
    throw error;
  });

  return managerInitPromise;
}

async function getManager() {
  return initializeManager();
}

async function runAccountManagerSmokeTest() {
  const activeManager = await initializeManager();
  const accountId = `smoke-${Date.now()}`;

  try {
    const created = await activeManager.addAccount({
      accountId,
      name: "Windows Packaged Smoke Test",
      city: "Kediri",
    });

    if (
      created.accountId !== accountId ||
      created.enabled !== true
    ) {
      throw new Error(
        "AccountManager smoke test gagal membuat akun aktif.",
      );
    }

    const persisted = activeManager.getAccount(accountId);

    if (!persisted) {
      throw new Error(
        "AccountManager smoke test gagal membaca akun yang baru dibuat.",
      );
    }

    console.log(
      `[smoke] AccountManager OK: ${activeManager.databaseFile}`,
    );
  } finally {
    try {
      if (activeManager.getAccount(accountId)) {
        await activeManager.removeAccount(accountId);
      }
    } finally {
      activeManager.close();
    }
  }
}

const notifier = new TelegramNotifier();
const replySessions = new Map(); // accountId -> MarketplaceSession aktif buat reply manual

let rotationState = {
  round: 0,
  currentBatch: [],
  checkedSoFar: 0,
  totalAccounts: 0,
};

function broadcastStatus() {
  if (!mainWindow || mainWindow.isDestroyed() || !manager) return;
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

    getProxy: (accountId) => manager.getProxy(accountId),
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

ipcMain.handle("accounts:getAll", async () => {
  try {
    const activeManager = await getManager();
    return activeManager.getAllStatuses();
  } catch (error) {
    broadcastLog(
      `Gagal memuat Account Manager: ${error.message}`,
      "error",
    );
    throw error;
  }
});

ipcMain.handle("accounts:add", async (_event, { accountId, name, city }) => {
  try {
    const activeManager = await getManager();

    await activeManager.addAccount({
      accountId,
      name,
      city,
    });

    broadcastStatus();

    broadcastLog(
      `Akun "${accountId}" berhasil ditambahkan.`,
      "success",
    );

    return activeManager.getAllStatuses();
  } catch (error) {
    broadcastLog(
      `Gagal menambahkan akun "${accountId}": ${error.message}`,
      "error",
    );
    throw error;
  }
});
ipcMain.handle("engine:getStatus", () => ({
  running: Boolean(rotator?.running),
}));
ipcMain.handle("rotation:getState", () => rotationState);

ipcMain.handle("engine:start", async () => {
  const activeManager = await getManager();

  if (rotator?.running) {
    return {
      running: true,
      started: false,
      reason: "ALREADY_RUNNING",
    };
  }

  const enabledAccounts = activeManager.getEnabledAccounts();

  if (enabledAccounts.length === 0) {
    broadcastLog("Bot tidak dapat dimulai: tidak ada akun yang aktif.", "warn");

    broadcastEngineStatus(false);

    return {
      running: false,
      started: false,
      reason: "NO_ACCOUNTS",
    };
  }

  rotator = createRotator();

  broadcastLog(`Rotasi dimulai untuk ${enabledAccounts.length} akun .`, "info");

  broadcastEngineStatus(true);

  rotator.start().finally(() => {
    broadcastEngineStatus(false);
  });

  return {
    running: true,
    started: true,
  };
});

ipcMain.handle("engine:stop", async () => {
  if (rotator) rotator.stop();
  broadcastLog("Perintah stop diterima.", "info");
  return { running: false };
});

ipcMain.handle("accounts:remove", async (_event, accountId) => {
  const activeManager = await getManager();

  await activeManager.removeAccount(accountId);

  broadcastStatus();

  return activeManager.getAllStatuses();
});

// Simpan perubahan nama/kota (dipanggil dari kartu akun yang di-klik-edit).
ipcMain.handle("accounts:update", async (_event, { accountId, updates }) => {
  const activeManager = await getManager();

  await activeManager.updateAccount(accountId, updates);

  broadcastStatus();

  return activeManager.getAllStatuses();
});


ipcMain.handle(
  "accounts:setProxy",
  async (_event, accountId, proxy) => {
    const activeManager = await getManager();
    const status = await activeManager.setProxy(
      accountId,
      proxy,
    );

    broadcastStatus();

    return status;
  },
);

ipcMain.handle(
  "accounts:removeProxy",
  async (_event, accountId) => {
    const activeManager = await getManager();
    const status = await activeManager.removeProxy(
      accountId,
    );

    broadcastStatus();

    return status;
  },
);

ipcMain.handle(
  "accounts:importProxyCsv",
  async () => {
    const activeManager = await getManager();

    const result = await dialog.showOpenDialog(
      mainWindow,
      {
        title: "Import Proxy CSV",
        properties: ["openFile"],
        filters: [
          {
            name: "CSV",
            extensions: ["csv"],
          },
        ],
      },
    );

    if (
      result.canceled ||
      result.filePaths.length === 0
    ) {
      return {
        cancelled: true,
      };
    }

    const filePath = result.filePaths[0];
    const text = await fs.readFile(
      filePath,
      "utf8",
    );

    const parsed = parseProxyCsv(text);
    const imported = await activeManager.importProxyRows(
      parsed.rows,
    );

    broadcastStatus();

    return {
      cancelled: false,
      fileName: path.basename(filePath),
      totalRows:
        parsed.rows.length +
        parsed.errors.length,
      parseErrors: parsed.errors,
      ...imported,
    };
  },
);

// Tombol "Balas Sekarang" -- buka (atau fokus ulang) sesi browser buat
// akun itu, terpisah dari siklus rotasi otomatis, biar user bisa balas
// manual.
ipcMain.handle("accounts:openReply", async (_event, accountId) => {
  const activeManager = await getManager();
  const account = activeManager.getAccount(accountId);
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

  const session = new MarketplaceSession({
    accountId,
    proxy: activeManager.getProxy(accountId),
  });
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

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      broadcastLog(
        `UI gagal dimuat (${errorCode}): ${errorDescription} — ${validatedURL}`,
        "error",
      );
    },
  );

  mainWindow.webContents.on("did-finish-load", () => {
    if (manager) {
      broadcastStatus();
      broadcastLog(
        `Aplikasi siap. Database: ${path.join(app.getPath("userData"), "botwatcher.db")}`,
        "info",
      );
      broadcastEngineStatus(Boolean(rotator?.running));
    }

    if (managerInitError) {
      broadcastLog(
        `Gagal memuat Account Manager: ${managerInitError.message}`,
        "error",
      );
    }
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
  if (isAccountManagerSmokeTest) {
    try {
      await runAccountManagerSmokeTest();
      app.quit();
    } catch (error) {
      console.error(
        "[smoke] AccountManager smoke test gagal:",
        error,
      );
      app.exit(1);
    }
    return;
  }

  try {
    await initializeManager();
  } catch {}

  createWindow();

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

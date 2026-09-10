// src/engine/botEngine.js
//
// Mesin utama bot sesuai alur proyek:
// AccountManager -> MarketplaceSession -> InboxMonitor -> TelegramNotifier
//
// Satu akun diproses sampai selesai dulu, lalu lanjut akun berikutnya.
// Tidak ada worker pool paralel di sini.

import { EventEmitter } from "events";
import { MarketplaceSession } from "../marketplace/session.js";
import { InboxMonitor } from "../monitor/inboxMonitor.js";

export class BotEngine extends EventEmitter {
  constructor({ accountManager, notifier, intervalMs = 5 * 60 * 1000 } = {}) {
    super();

    if (!accountManager) throw new Error("BotEngine membutuhkan AccountManager.");
    if (!notifier) throw new Error("BotEngine membutuhkan TelegramNotifier.");

    this.accountManager = accountManager;
    this.notifier = notifier;
    this.intervalMs = intervalMs;
    this.running = false;
    this.loopPromise = null;
    this.currentSession = null;
    this.currentMonitor = null;
  }

  async start() {
    if (this.running) return;

    if (!this.accountManager.loaded) {
      await this.accountManager.load();
    }

    const accounts = this.accountManager.getEnabledAccounts();
    if (accounts.length === 0) {
      this.emit("log", "Tidak ada akun aktif di accounts.json.", "warn");
      return;
    }

    this.running = true;
    this.emit("engine_status", { running: true });
    this.emit("log", `Bot dimulai untuk ${accounts.length} akun aktif.`, "info");

    this.loopPromise = this._runLoop();
    await this.loopPromise;
  }

  async stop() {
    if (!this.running) return;

    this.running = false;
    this.emit("log", "Perintah stop diterima.", "info");

    // Hentikan monitor aktif dan tutup sesi yang sedang dipakai.
    if (this.currentMonitor) this.currentMonitor.stop();
    if (this.currentSession) {
      await this.currentSession.close().catch(() => {});
    }

    this.emit("engine_status", { running: false });
  }

  async _runLoop() {
    try {
      while (this.running) {
        const accounts = this.accountManager.getEnabledAccounts();

        for (const account of accounts) {
          if (!this.running) break;
          await this._checkAccount(account);
        }

        if (!this.running) break;

        this.emit(
          "log",
          `Putaran selesai. Menunggu ${this.intervalMs / 1000} detik.`,
          "info",
        );
        await this._sleep(this.intervalMs);
      }
    } finally {
      this.currentMonitor = null;
      this.currentSession = null;
      this.running = false;
      this.emit("engine_status", { running: false });
    }
  }

  async _checkAccount(account) {
    const session = new MarketplaceSession({ accountId: account.accountId });
    const monitor = new InboxMonitor(session, { intervalMs: this.intervalMs });

    this.currentSession = session;
    this.currentMonitor = monitor;

    const onLog = (message, level) => this.emit("log", `[${account.accountId}] ${message}`, level);
    const onStatus = ({ totalUnread, checkedAt }) => {
      this.accountManager.updateStatus(account.accountId, {
        state: "monitoring",
        loggedIn: true,
        unreadCount: totalUnread,
        lastCheckedAt: checkedAt ?? new Date(),
        error: null,
      });
      this.emit("status", this.accountManager.getStatus(account.accountId));
    };
    const onError = (error) => {
      this.accountManager.updateStatus(account.accountId, {
        state: "error",
        error: error.message,
      });
      this.emit("status", this.accountManager.getStatus(account.accountId));
    };
    const onNewMessages = ({ totalUnread }) => {
      void this.notifier.notifyUnread(account.name, totalUnread);
    };

    monitor.on("log", onLog);
    monitor.on("status", onStatus);
    monitor.on("error", onError);
    monitor.on("new_messages", onNewMessages);

    this.accountManager.updateStatus(account.accountId, { state: "starting", error: null });
    this.emit("status", this.accountManager.getStatus(account.accountId));

    try {
      await session.open();

      if (!session.isLoggedIn) {
        this.accountManager.updateStatus(account.accountId, {
          state: "offline",
          loggedIn: false,
          unreadCount: null,
          error: null,
        });
        this.emit("status", this.accountManager.getStatus(account.accountId));
        return;
      }

      await monitor._checkOnce();
    } catch (error) {
      this.accountManager.updateStatus(account.accountId, {
        state: "error",
        loggedIn: session.isLoggedIn,
        error: error.message,
      });
      this.emit("status", this.accountManager.getStatus(account.accountId));
      this.emit("error", { accountId: account.accountId, error });
    } finally {
      monitor.removeListener("log", onLog);
      monitor.removeListener("status", onStatus);
      monitor.removeListener("error", onError);
      monitor.removeListener("new_messages", onNewMessages);

      await session.close().catch(() => {});
      this.currentSession = null;
      this.currentMonitor = null;

      if (this.running && this.accountManager.getStatus(account.accountId)?.state === "monitoring") {
        this.accountManager.updateStatus(account.accountId, { state: "stopped" });
        this.emit("status", this.accountManager.getStatus(account.accountId));
      }
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

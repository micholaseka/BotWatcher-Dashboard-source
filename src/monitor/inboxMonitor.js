// src/monitor/inboxMonitor.js
//
// OTAK-nya "Pemantauan Inbox": buka halaman inbox Marketplace secara
// berkala, baca badge "Chats to answer" (angka pesan belum dijawab),
// dan kirim event kalau angkanya lebih dari 0.
//
// VERSI SIMPEL (tahap awal): kita belum baca per-percakapan / nama
// pengirim. Cukup tahu "ada pesan masuk atau enggak" dulu.

import { EventEmitter } from "events";
import { marketplaceInboxSelectors as sel } from "./selectors.js";

export class InboxMonitor extends EventEmitter {
  constructor(session, { intervalMs = 5 * 60 * 1000 } = {}) {
    super();
    this.session = session;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.running = false;

    this.lastCheckAt = null;
    this.lastCheckResult = null;
    this.logs = [];
  }

  start() {
    if (this.running) {
      this._log("Pemantauan sudah berjalan.", "warn");
      return;
    }
    this.running = true;
    this._log(
      `Pemantauan dimulai, interval ${this.intervalMs / 1000} detik.`,
      "info",
    );
    this._checkOnce();
    this.timer = setInterval(() => this._checkOnce(), this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    this._log("Pemantauan dihentikan.", "info");
  }

  setInterval(intervalMs) {
    this.intervalMs = intervalMs;
    if (this.running) {
      this.stop();
      this.start();
    }
  }

  async _checkOnce() {
    const page = this.session.page;
    if (!page || page.isClosed()) {
      this._log("Halaman browser tidak tersedia. Lewati pengecekan.", "error");
      return;
    }

    try {
      await page.goto(sel.inboxUrl, { waitUntil: "domcontentloaded" });

      // PENTING: badge-nya nongol duluan dengan angka "0" (placeholder),
      // baru beberapa detik kemudian JS Facebook update ke angka asli.
      // "waitFor attached" gak cukup karena elemennya udah ADA dari awal,
      // cuma ISINYA yang belum benar. Makanya kita jeda diam dulu.
      await page.waitForTimeout(6000);

      const badge = page.locator(sel.unreadBadge);
      const text = await badge.last().innerText().catch(() => "0");
      this._log(`Teks mentah yang kebaca dari badge: "${text}"`, "info");
      const unreadCount = parseInt(text.trim(), 10) || 0;

      this.lastCheckAt = new Date();
      this.lastCheckResult = { totalUnread: unreadCount };

      const hasNew = unreadCount > 0;

      this._log(
        `Cek selesai: ${unreadCount} pesan belum dijawab.`,
        hasNew ? "success" : "info",
      );

      if (hasNew) {
        this.emit("new_messages", {
          totalUnread: unreadCount,
          checkedAt: this.lastCheckAt,
        });
      }

      this.emit("status", {
        ...this.lastCheckResult,
        checkedAt: this.lastCheckAt,
      });
    } catch (err) {
      this._log(`Pengecekan gagal: ${err.message}`, "error");
      this.emit("error", err);
    }
  }

  getLastStatus() {
    return { checkedAt: this.lastCheckAt, result: this.lastCheckResult };
  }

  getLogs() {
    return this.logs;
  }

  _log(message, level = "info") {
    const entry = { message, level, at: new Date() };
    this.logs.push(entry);
    if (this.logs.length > 200) this.logs.shift();
    this.emit("log", message, level);
  }
}
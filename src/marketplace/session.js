// src/marketplace/session.js
//
// Modul ini urus SATU hal aja: buka browser & pastikan sudah login ke
// Facebook, apa pun mode-nya (Chromium test di Ubuntu, atau Chrome Portable
// asli di Windows nanti). Logic deteksi login (cookie c_user + xs) diambil
// dari automation.js (botautomationpost), lalu dirapikan supaya bisa jalan
// di 2 mode.

import fs from "fs/promises";
import path from "path";
import { EventEmitter } from "events";
import { getStealthChromium, stealthLaunchOptions } from "./stealth.js";
import { ENGINE_MODE, getSessionConfig } from "../config/engine.config.js";

export class MarketplaceSession extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {string} [opts.accountId]   Nama/ID akun. Dipakai buat nama file
   *                                    sesi (mode dev) atau nama profil Chrome
   *                                    (mode chrome-portable, misal "Profile 2").
   * @param {boolean} [opts.forceLogin] Paksa buka halaman login Facebook
   *                                    (dipakai untuk akun berstatus error:
   *                                    sesi kadaluarsa / ditangguhkan).
   */
  constructor({ accountId = "default", forceLogin = false } = {}) {
    super();

    this.accountId = accountId;
    this.forceLogin = forceLogin;

    this.mode = ENGINE_MODE;
    this.config = getSessionConfig();

    this.browser = null;
    this.context = null;
    this.page = null;
    this.isLoggedIn = false;
    this.detectionTimer = null;
  }

  /** Buka browser & siapkan sesi sesuai mode aktif. */
  async open() {
    this.emit(
      "log",
      `Membuka sesi (mode: ${this.mode}, akun: ${this.accountId})...`,
      "info",
    );

    if (this.mode === "chrome-portable") {
      await this.openChromePortable();
    } else {
      await this.openDevChromium();
    }

    this.page = this.context.pages()[0] || (await this.context.newPage());
    this.page.setDefaultTimeout(45000);
    this.page.setDefaultNavigationTimeout(45000);

    await this.checkLoginStatus();

    if (this.forceLogin) {
      // Akun berstatus error (sesi kadaluarsa / ditangguhkan / banned):
      // cookie c_user/xs mungkin MASIH ADA tapi tidak valid, jadi deteksi
      // login biasa menipu. Langgung buka halaman login supaya user bisa
      // login ulang dari tombol "Balas Sekarang" di kartu merah.
      this.emit(
        "log",
        "Akun berstatus error — membuka halaman login Facebook untuk login ulang.",
        "warn",
      );
      await this.page.goto("https://www.facebook.com/login", {
        waitUntil: "domcontentloaded",
      });
    } else if (this.isLoggedIn) {
      // Sesi sudah ada -> langsung ke Marketplace, jangan biarkan
      // halaman nongkrong di about:blank.
      this.emit("log", "Sesi ditemukan, membuka Marketplace...", "info");
      await this.page.goto(
        "https://www.facebook.com/marketplace/you/dashboard/",
        {
          waitUntil: "domcontentloaded",
        },
      );
    } else {
      this.emit(
        "log",
        this.mode === "chrome-portable"
          ? "Belum terdeteksi login di profil Chrome ini. Cek kembali profil yang dipilih."
          : "Belum ada sesi. Silakan login manual di jendela yang terbuka.",
        "warn",
      );
      if (this.mode === "dev") {
        await this.page.goto("https://www.facebook.com/login", {
          waitUntil: "domcontentloaded",
        });
      }
    }

    // PENTING: emit "login_status" di sini, SETELAH navigasi awal di atas
    // selesai -- bukan sebelumnya. Listener (index.js) langsung memulai
    // InboxMonitor begitu event ini diterima, dan InboxMonitor langsung
    // page.goto(inboxUrl) di page yang SAMA. Kalau emit ini dipanggil
    // sebelum navigasi Marketplace di atas selesai, dua goto() akan
    // bertabrakan di page yang sama -> Chromium abort salah satunya
    // (net::ERR_ABORTED), dan pengecekan inbox pertama gagal.
    this.emit("login_status", {
      isLoggedIn: this.isLoggedIn,
      accountId: this.accountId,
    });
    this.startLoginDetection();
  }

  /**
   * Mode dev: Chromium bawaan Playwright + sesi disimpan di file
   * storageState.json (satu file per akun). Cocok buat testing di Ubuntu.
   */
  async openDevChromium() {
    const sessionFile = path.join(
      this.config.sessionDirectory,
      `${this.accountId}.json`,
    );
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });
    this.sessionFile = sessionFile;

    let storageState;
    try {
      await fs.access(sessionFile);
      storageState = sessionFile;
      this.emit("log", "Menggunakan sesi login tersimpan.", "info");
    } catch {
      this.emit("log", "Tidak ada sesi tersimpan untuk akun ini.", "info");
    }

    const playwrightChromium = await getStealthChromium();

    this.browser = await playwrightChromium.launch({
      ...stealthLaunchOptions,
    });

    this.context = await this.browser.newContext({
      ...(storageState ? { storageState } : {}),
      viewport: null,
    });
  }

  /**
   * Mode chrome-portable: buka Chrome Portable asli di Windows, langsung
   * pakai profil (this.accountId, misal "Profile 2") yang sesinya SUDAH
   * ada dari sebelumnya (login manual satu kali lewat Chrome biasa). Tidak
   * ada storageState di sini karena kita "pinjam kamar" yang sudah dihuni,
   * bukan menyuntik sesi ke browser kosong.
   */
  async openChromePortable() {
    const playwrightChromium = await getStealthChromium();

    this.context = await playwrightChromium.launchPersistentContext(
      this.config.userDataDir,
      {
        executablePath: this.config.executablePath,
        ...stealthLaunchOptions,
        args: [
          ...stealthLaunchOptions.args,
          `--profile-directory=${this.accountId}`,
        ],
      },
    );
    // launchPersistentContext tidak mengembalikan objek browser terpisah;
    // this.browser sengaja dibiarkan null di mode ini.
  }

  /** Cek sekali apakah sesi saat ini sudah login (cookie c_user + xs ada). */
  async checkLoginStatus() {
    if (!this.context) return false;
    try {
      const cookies = await this.context.cookies();
      const hasUser = cookies.some((c) => c.name === "c_user");
      const hasXs = cookies.some((c) => c.name === "xs");
      this.isLoggedIn = hasUser && hasXs;
      return this.isLoggedIn;
    } catch {
      return false;
    }
  }

  /** Pantau status login tiap 2.5 detik, kirim event kalau berubah. */
  startLoginDetection() {
    if (this.detectionTimer) clearInterval(this.detectionTimer);

    this.detectionTimer = setInterval(async () => {
      if (!this.context || (this.browser && !this.browser.isConnected())) {
        clearInterval(this.detectionTimer);
        this.detectionTimer = null;
        return;
      }

      const wasLoggedIn = this.isLoggedIn;
      await this.checkLoginStatus();

      if (this.isLoggedIn && !wasLoggedIn) {
        this.emit("log", "Login terdeteksi sukses.", "success");
        this.emit("login_status", {
          isLoggedIn: true,
          accountId: this.accountId,
        });

        // Simpan sesi ke file HANYA di mode dev. Di mode chrome-portable,
        // Chrome sendiri yang sudah menyimpan sesinya di folder profil.
        if (this.mode === "dev" && this.sessionFile) {
          try {
            await this.context.storageState({ path: this.sessionFile });
            this.emit("log", "Sesi login berhasil disimpan.", "info");
          } catch (err) {
            this.emit("log", `Gagal simpan sesi: ${err.message}`, "error");
          }
        }
      } else if (!this.isLoggedIn && wasLoggedIn) {
        this.emit("log", "Sesi terputus.", "warn");
        this.emit("login_status", {
          isLoggedIn: false,
          accountId: this.accountId,
        });
      }
    }, 2500);
  }

  /** Tutup browser/konteks dan hentikan pemantauan. */
  async close() {
    if (this.detectionTimer) {
      clearInterval(this.detectionTimer);
      this.detectionTimer = null;
    }
    try {
      if (this.page && !this.page.isClosed()) await this.page.close();
    } catch {}
    try {
      if (this.context) await this.context.close();
    } catch {}
    try {
      if (this.browser && this.browser.isConnected())
        await this.browser.close();
    } catch {}

    this.browser = null;
    this.context = null;
    this.page = null;
    this.isLoggedIn = false;
    this.emit("log", "Sesi ditutup.", "info");
  }
}

// src/marketplace/session.js
//
// Modul ini urus SATU hal aja: buka browser & pastikan sudah login ke
// Facebook, apa pun mode-nya (profil Chromium permanen di Ubuntu, atau
// Chrome Portable asli di Windows). Logic deteksi login (cookie c_user +
// xs) diambil dari automation.js (botautomationpost), lalu dirapikan
// supaya bisa jalan di 2 mode.

import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { EventEmitter } from "events";
import { getStealthChromium, stealthLaunchOptions } from "./stealth.js";
import { ENGINE_MODE, getSessionConfig } from "../config/engine.config.js";

// Profil Chromium (dan profil Chrome Portable) tidak bisa dibuka dua kali
// sekaligus. Rotator dan tombol "Balas Sekarang" bisa meminta akun yang
// sama bersamaan, jadi tiap akun diantrikan lock di sini.
const accountQueues = new Map(); // accountId -> Promise yang resolve saat sesi tutup

function acquireAccountSlot(accountId) {
  const previous = accountQueues.get(accountId) ?? Promise.resolve();

  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });

  // Tiap pemanggil menunggu pemanggil sebelumnya, lalu pegil slot-nya.
  accountQueues.set(accountId, previous.then(() => current));

  return previous.then(() => release);
}

/**
 * Tunggu Chromium melepas SingletonLock (symlink penanda "profil sedang
 * dipakai", mengarah ke "<host>-<pid>"). Dua kasus:
 *   1. Browser masih hidup -> tunggu (maks 15 detik) sampai lock lepas.
 *   2. Symlink nyangkut/dangling (proses mati tanpa bersih-bersih, mis.
 *      Playwright force-kill) -> hapus supaya akun tetap bisa dibuka.
 * Aman karena semua akses profil sudah diserialisasi oleh
 * acquireAccountSlot di atas.
 */
async function waitForProfileUnlocked(profileDirectory) {
  const lockFile = path.join(profileDirectory, "SingletonLock");
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    let lockStat;
    try {
      lockStat = await fs.lstat(lockFile); // lstat: lihat symlink-nya sendiri
    } catch {
      return; // tidak ada lock sama sekali
    }

    if (lockStat.isSymbolicLink()) {
      let ownerAlive = true;
      try {
        await fs.stat(lockFile); // stat: ikuti symlink ke target-nya
      } catch {
        ownerAlive = false;
      }

      if (!ownerAlive) {
        // Target hilang = pemilik sudah mati. Symlink-nya nyangkut.
        await fs.rm(lockFile, { force: true }).catch(() => {});
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  // Keputusan terakhir: hapus lock yang tidak pernah lepas.
  await fs.rm(lockFile, { force: true }).catch(() => {});
}

export class MarketplaceSession extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {string} [opts.accountId]   Nama/ID akun. Dipakai buat nama
   *                                    folder profil permanen (mode dev)
   *                                    atau nama profil Chrome (mode
   *                                    chrome-portable, misal "Profile 2").
   * @param {boolean} [opts.forceLogin] Paksa buka halaman login Facebook
   *                                    (dipakai untuk akun berstatus error:
   *                                    sesi kadaluarsa / ditangguhkan).
   * @param {boolean} [opts.headless]   Jalan tanpa window (default false).
   *                                    Rotator pakai true biar cek 5-10
   *                                    akun tidak memunculkan window;
   *                                    sesi "Balas Sekarang" pakai false
   *                                    supaya user bisa lihat & balas.
   */
  constructor({ accountId = "default", forceLogin = false, headless = false } = {}) {
    super();

    this.accountId = accountId;
    this.forceLogin = forceLogin;
    this.headless = headless;

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

    // Satu profil per akun: tunggu sesi sebelumnya untuk akun yang sama
    // tutup dulu, kalau tidak Chromium menolak dibuka (profil in-use).
    this._releaseAccountSlot = await acquireAccountSlot(this.accountId);

    try {
      await this._openInternal();
    } catch (error) {
      if (this._releaseAccountSlot) {
        this._releaseAccountSlot();
        this._releaseAccountSlot = null;
      }
      throw error;
    }
  }

  async _openInternal() {
    if (this.mode === "chrome-portable") {
      await this.openChromePortable();
    } else {
      await this.openDevChromium();
    }

    this.page = this.context.pages()[0] || (await this.context.newPage());
    this.page.setDefaultTimeout(45000);
    this.page.setDefaultNavigationTimeout(45000);

    if (this.headless) {
      await this._hideHeadlessUserAgent();
    }

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
   * Mode dev: Chromium patchright dengan PROFIL PERMANEN per akun
   * (bukan lagi browser bersih/incognito + suntik cookie dari file).
   * Cookie, localStorage, cache, dan IndexedDB akun ikut tersimpan di
   * folder profil -- jauh lebih mirip user asli dan sesuai best
   * practice patchright.
   *
   * Kalau masih ada file sesi LAMA (storageState.json) dan profil akun
   * belum pernah dipakai, cookie-nya disuntik SEKALI supaya akun yang
   * sudah login tidak perlu login ulang. Setelah itu sesi disimpan
   * browser sendiri di folder profil.
   */
  async openDevChromium() {
    const profileDirectory = path.join(
      this.config.profileDirectory,
      this.accountId,
    );
    await fs.mkdir(profileDirectory, { recursive: true });

    const legacySessionFile = path.join(
      this.config.sessionDirectory,
      `${this.accountId}.json`,
    );

    // Seed hanya kalau profil benar-benar kosong (belum pernah dipakai).
    // Kalau profil sudah berisi sesi yang di-refresh Facebook, file lama
    // TIDAK dipakai lagi -- menyuntiknya tiap kali justru memaksa cookie
    // kedaluwarsa kembali.
    const isFirstRun = (await fs.readdir(profileDirectory)).length === 0;

    let seedFile = null;
    if (isFirstRun && existsSync(legacySessionFile)) {
      seedFile = legacySessionFile;
      this.emit(
        "log",
        "Menemukan sesi login lama — akan dipindahkan ke profil permanen.",
        "info",
      );
    } else if (isFirstRun) {
      this.emit("log", "Profil baru — silakan login manual.", "info");
    } else {
      this.emit("log", "Memakai profil permanen akun.", "info");
    }

    const playwrightChromium = await getStealthChromium();

    // Chromium butuh beberapa saat melepas SingletonLock setelah browser
    // ditutup. Buka lagi terlalu cepat = proses baru gagal (exit code 21,
    // "profile in use"). Ini ruteknya: klik "Balas Sekarang" tepat
    // setelah akun itu selesai dicek rotator.
    await waitForProfileUnlocked(profileDirectory);

    this.context = await playwrightChromium.launchPersistentContext(
      profileDirectory,
      {
        ...stealthLaunchOptions,
        headless: this.headless,
      },
    );

    // Patchright TIDAK menerapkan opsi storageState di persistent context
    // (sudah diuji: cookie-nya tidak masuk), jadi cookie file lama
    // disuntik manual lewat addCookies.
    if (seedFile) {
      try {
        const legacyState = JSON.parse(await fs.readFile(seedFile, "utf8"));

        if (
          Array.isArray(legacyState.cookies) &&
          legacyState.cookies.length > 0
        ) {
          await this.context.addCookies(legacyState.cookies);
          this.emit(
            "log",
            "Sesi lama berhasil dipindahkan ke profil permanen.",
            "info",
          );
        }
      } catch (err) {
        this.emit("log", `Gagal memindahkan sesi lama: ${err.message}`, "warn");
      }
    }
    // launchPersistentContext tidak mengembalikan objek browser terpisah;
    // this.browser sengaja dibiarkan null (sama seperti chrome-portable).
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

    // Sama seperti mode dev: tunggu Chromium/Chrome melepas SingletonLock.
    await waitForProfileUnlocked(this.config.userDataDir);

    this.context = await playwrightChromium.launchPersistentContext(
      this.config.userDataDir,
      {
        executablePath: this.config.executablePath,
        ...stealthLaunchOptions,
        headless: this.headless,
        args: [
          ...stealthLaunchOptions.args,
          `--profile-directory=${this.accountId}`,
        ],
      },
    );
    // launchPersistentContext tidak mengembalikan objek browser terpisah;
    // this.browser sengaja dibiarkan null di mode ini.
  }

  /**
   * Chromium headless melaporkan User-Agent "HeadlessChrome/<versi>" --
   * tanda bot yang langsung terlihat server. Override di level HTTP
   * header (bukan JS): kata "Headless" dihapus, versi Chrome-nya TETAP
   * ASLI, jadi ini bukan UA palsu.
   *
   * Dipanggil sekali per sesi headless. Kalau gagal, sesi tetap jalan
   * (kembali berdampak ke deteksi saja).
   */
  async _hideHeadlessUserAgent() {
    try {
      const originalUA = await this.page.evaluate(() => navigator.userAgent);

      if (!originalUA.includes("HeadlessChrome")) return;

      const cdp = await this.context.newCDPSession(this.page);
      await cdp.send("Network.setUserAgentOverride", {
        userAgent: originalUA.replace("HeadlessChrome", "Chrome"),
      });
    } catch {
      // sengaja diabaikan: sesi headless tetap berguna walau gagal
    }
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

        // Mode dev: sesi tersimpan OTOMATIS di folder profil permanen
        // (cookie + localStorage), tidak ada lagi penulisan file
        // storageState. Mode chrome-portable: Chrome yang menyimpan.
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

    // Buka lock akun supaya sesi berikutnya untuk akun ini bisa jalan.
    if (this._releaseAccountSlot) {
      this._releaseAccountSlot();
      this._releaseAccountSlot = null;
    }

    this.emit("log", "Sesi ditutup.", "info");
  }
}

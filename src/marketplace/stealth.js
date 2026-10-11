// src/marketplace/stealth.js
//
// Penyamaran anti-bot: satu tempat buat inisialisasi browser.
//
// Pakai patchright -- drop-in replacement Playwright yang sudah di-patch
// supaya tidak terdeteksi bot (Facebook ketat banget soal ini):
//   - Runtime.enable leak: penyebab utama deteksi Playwright. Patchright
//     menjalankan JS tanpa memakai CDP Runtime.enable.
//   - Console.enable leak: Console API dimatikan (aplikasi ini tidak
//     memakai console browser, jadi aman).
//   - Command flags: "--enable-automation" dihapus,
//     "--disable-blink-features=AutomationControlled" ditambah ->
//     navigator.webdriver jadi false.
//   - Berbagai leak umum lain di codebase Playwright.
//
// Best practice patchright (ikut persis):
//   - headless: false
//   - viewport: null
//   - JANGAN pakai custom userAgent/headers -- UA palsu justru jadi
//     sidik jari tambahan.

import path from "path";

let chromium = null;

/**
 * Ambil instance chromium patchright (lazy supaya import berat hanya
 * terjadi saat browser benar-benar dibuka).
 *
 * Di app ter-package (Windows), Chromium dibundel di resources/.
 * Patchright tetap membaca env var PLAYWRIGHT_BROWSERS_PATH yang sama
 * seperti Playwright, jadi lokasi browser bundel tidak berubah.
 */
export async function getStealthChromium() {
  if (chromium) return chromium;

  if (!process.defaultApp && process.resourcesPath) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(
      process.resourcesPath,
      "playwright-browsers",
    );
  }

  ({ chromium } = await import("patchright"));

  return chromium;
}

/**
 * Opsi launch bersama (dipakai mode dev & mode chrome-portable).
 * Args di bawah aman -- bukan penanda automation. Flag automation
 * (mis. "--disable-blink-features=...") JANGAN ditambah manual di sini:
 * patchright sudah mengaturnya sendiri.
 */
export const stealthLaunchOptions = {
  headless: false,
  viewport: null,
  args: ["--start-maximized", "--no-first-run", "--no-default-browser-check"],
};

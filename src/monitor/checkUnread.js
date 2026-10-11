// src/monitor/checkUnread.js
//
// Fungsi kecil, reusable: buka halaman dashboard & baca angka "Obrolan
// yang perlu dijawab". Dipisah dari inboxMonitor.js supaya bisa dipakai
// juga sama accountRotator.js (buat cek banyak akun bergantian).
//
// PENTING: kalau dashboard TIDAK terbaca (redirect ke login/checkpoint
// karena sesi kadaluarsa atau akun ditangguhkan/banned), fungsi ini
// mengembalikan null -- BUKAN 0. Bedanya penting:
//   0    = akun sehat, tidak ada pesan belum dijawab -> status Aktif
//   null = akun tidak bisa dipakai sekarang            -> status Tidur
// Kalau dulu kita fallback ke "0", akun banned salah dilaporkan aktif.

import { marketplaceInboxSelectors as sel } from "./selectors.js";

/**
 * @param {import('playwright').Page} page
 * @returns {Promise<number|null>} jumlah pesan belum dijawab, atau null
 *   kalau dashboard tidak terbaca (sesi/akun bermasalah).
 */
export async function checkUnreadCount(page) {
  await page.goto(sel.inboxUrl, { waitUntil: "domcontentloaded" });

  // Sama kayak di inboxMonitor.js: badge nongol duluan dengan angka "0"
  // placeholder, baru beberapa detik kemudian keupdate ke angka asli.
  await page.waitForTimeout(6000);

  const badge = page.locator(sel.unreadBadge);

  if ((await badge.count()) === 0) {
    // Beri satu waktu tambahan sebelum menyimpulkan akun bermasalah:
    // jaringan lambat juga bisa bikin badge telat muncul.
    await page.waitForTimeout(4000);

    if ((await badge.count()) === 0) {
      return null;
    }
  }

  const text = await badge.last().innerText().catch(() => "0");

  return parseInt(text.trim(), 10) || 0;
}

/**
 * Alasan kenapa dashboard tidak terbaca, dibedakan dari URL terakhir
 * halaman. Dipakai buat pesan status di kartu akun (status Tidur).
 * @param {string} url
 * @returns {string}
 */
export function describeUnusable(url) {
  if (url.includes("checkpoint")) {
    return "Akun kena checkpoint Facebook — perlu verifikasi manual.";
  }
  if (url.includes("/login")) {
    return "Sesi login tidak valid — perlu login ulang.";
  }
  return "Dashboard tidak terbaca — akun kemungkinan ditangguhkan/dibanned.";
}

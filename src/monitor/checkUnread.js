// src/monitor/checkUnread.js
//
// Fungsi kecil, reusable: buka halaman dashboard & baca angka "Obrolan
// yang perlu dijawab". Dipakai oleh accountRotator.js untuk mengecek
// banyak akun bergantian.
//
// PENTING: kalau dashboard TIDAK terbaca (redirect ke login/checkpoint
// karena sesi kadaluarsa atau akun ditangguhkan/banned), fungsi ini
// mengembalikan null -- BUKAN 0. Bedanya penting:
//   0    = akun sehat, tidak ada pesan belum dijawab -> status Aktif
//   null = akun tidak bisa dipakai sekarang            -> status Tidur
// Kalau dulu kita fallback ke "0", akun banned salah dilaporkan aktif.

import { marketplaceInboxSelectors as sel } from "./selectors.js";

const NAVIGATION_TIMEOUT_MS = 15_000;

export class InboxNavigationTimeoutError extends Error {
  constructor(cause) {
    super(
      `Dashboard Facebook tidak selesai dimuat dalam ${NAVIGATION_TIMEOUT_MS / 1000} detik.`,
      { cause },
    );
    this.name = "InboxNavigationTimeoutError";
  }
}

function isUnavailableUrl(url) {
  return /checkpoint|\/login(?:[/?#]|$)|suspend|disabled|blocked/i.test(url);
}

async function hasUnavailableMessage(page) {
  const bodyText = (await page.locator("body").innerText({ timeout: 2000 }))
    .toLowerCase();
  return sel.unavailableText.some((message) =>
    bodyText.includes(message.toLowerCase()),
  );
}

/**
 * @param {import('playwright').Page} page
 * @returns {Promise<number|null>} jumlah pesan belum dijawab, atau null
 *   kalau dashboard tidak terbaca (sesi/akun bermasalah).
 */
export async function checkUnreadCount(page) {
  try {
    await page.goto(sel.inboxUrl, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
  } catch (error) {
    if (error?.name === "TimeoutError") {
      throw new InboxNavigationTimeoutError(error);
    }
    throw error;
  }

  if (
    isUnavailableUrl(page.url()) ||
    (await hasUnavailableMessage(page))
  ) {
    return null;
  }

  // Sama kayak di rotator: badge nongol duluan dengan angka "0"
  // placeholder, baru beberapa detik kemudian keupdate ke angka asli.
  await page.waitForTimeout(6000);

  if (
    isUnavailableUrl(page.url()) ||
    (await hasUnavailableMessage(page))
  ) {
    return null;
  }

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
  const normalizedUrl = url.toLowerCase();
  if (normalizedUrl.includes("checkpoint")) {
    return "Akun kena checkpoint Facebook — perlu verifikasi manual.";
  }
  if (normalizedUrl.includes("/login")) {
    return "Sesi login tidak valid — perlu login ulang.";
  }
  if (/suspend|disabled|blocked/i.test(normalizedUrl)) {
    return "Akun ditangguhkan, dinonaktifkan, atau diblokir Facebook.";
  }
  return "Dashboard tidak terbaca — akun mungkin ditangguhkan, diblokir, atau memerlukan pemeriksaan.";
}

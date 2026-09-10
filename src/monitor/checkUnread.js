// src/monitor/checkUnread.js
//
// Fungsi kecil, reusable: buka halaman dashboard & baca angka "Obrolan
// yang perlu dijawab". Dipisah dari inboxMonitor.js supaya bisa dipakai
// juga sama accountRotator.js (buat cek banyak akun bergantian).

import { marketplaceInboxSelectors as sel } from "./selectors.js";

/**
 * @param {import('playwright').Page} page
 * @returns {Promise<number>} jumlah pesan belum dijawab
 */
export async function checkUnreadCount(page) {
  await page.goto(sel.inboxUrl, { waitUntil: "domcontentloaded" });

  // Sama kayak di inboxMonitor.js: badge nongol duluan dengan angka "0"
  // placeholder, baru beberapa detik kemudian keupdate ke angka asli.
  await page.waitForTimeout(6000);

  const badge = page.locator(sel.unreadBadge);
  const text = await badge.last().innerText().catch(() => "0");
  return parseInt(text.trim(), 10) || 0;
}
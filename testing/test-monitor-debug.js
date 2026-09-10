// testing/test-monitor-debug.js
//
// Script DEBUG SAJA. Jalankan: node testing/test-monitor-debug.js
//
// Tujuannya: nunjukin PERSIS apa yang browser lihat di halaman inbox,
// biar ketauan kenapa unreadBadge kebaca "0" padahal harusnya ada 3.

import { MarketplaceSession } from "../src/marketplace/session.js";

const accountId = process.argv[2] || "test-account-1";
const session = new MarketplaceSession({ accountId });

session.on("log", (msg, level) => console.log(`[session] ${msg}`));

async function main() {
  await session.open();

  if (!session.isLoggedIn) {
    console.log("Belum login, login manual dulu...");
    await new Promise((resolve) => {
      session.once("login_status", ({ isLoggedIn }) => {
        if (isLoggedIn) resolve();
      });
    });
  }

  const page = session.page;

  console.log("\n=== Buka halaman dashboard ===");
  await page.goto("https://www.facebook.com/marketplace/you/dashboard/", {
    waitUntil: "domcontentloaded", // networkidle gak cocok, FB selalu ada koneksi background jalan
  });

  // Kasih jeda ekstra biar konten dashboard (card-card angka) kelar dirender
  await page.waitForTimeout(6000);

  console.log("\n=== Screenshot disimpan ke debug-inbox.png ===");
  await page.screenshot({ path: "debug-inbox.png", fullPage: true });

  console.log("\n=== Cari SEMUA link yang mengandung targetTab=SELLER ===");
  const links = page.locator('a[href*="targetTab=SELLER"]');
  const linkCount = await links.count();
  console.log(`Jumlah elemen ketemu: ${linkCount}`);

  for (let i = 0; i < linkCount; i++) {
    const el = links.nth(i);
    const text = await el.innerText().catch(() => "(gagal baca)");
    const isVisible = await el.isVisible().catch(() => false);
    console.log(`\n--- Elemen #${i} ---`);
    console.log(`Visible: ${isVisible}`);
    console.log(`Isi teks lengkap: "${text}"`);
  }

  console.log("\n=== Cari SEMUA span[dir=auto] di dalam link tersebut ===");
  const spans = page.locator('a[href*="targetTab=SELLER"] span[dir="auto"]');
  const spanCount = await spans.count();
  console.log(`Jumlah span ketemu: ${spanCount}`);

  for (let i = 0; i < spanCount; i++) {
    const el = spans.nth(i);
    const text = await el.innerText().catch(() => "(gagal baca)");
    console.log(`Span #${i}: "${text}"`);
  }

  console.log("\n=== SELESAI. Cek debug-inbox.png buat liat tampilan asli. ===");
  console.log("Browser TIDAK ditutup otomatis — cek manual, tutup sendiri kalau udah selesai liat.");
}

main().catch((err) => {
  console.error("Debug gagal:", err);
});
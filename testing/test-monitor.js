// testing/test-monitor.js
//
// Script buat NGETES SAJA — bukan bagian dari aplikasi utama. Jalankan
// dengan: npm run test:monitor
//
// Fungsinya: buka sesi login yang udah tersimpan (dari test:session),
// lalu jalanin InboxMonitor sekali buat cek apakah badge "Chats to
// answer" kebaca dengan benar.

import { MarketplaceSession } from "../src/marketplace/session.js";
import { InboxMonitor } from "../src/monitor/inboxMonitor.js";

const accountId = process.argv[2] || "test-account-1";

const session = new MarketplaceSession({ accountId });

session.on("log", (msg, level) => {
  console.log(`[session/${level || "log"}] ${msg}`);
});

async function main() {
  console.log(`=== Test monitor untuk akun: "${accountId}" ===`);
  await session.open();

  if (!session.isLoggedIn) {
    console.log("Belum login. Login manual dulu di jendela browser, lalu jalankan ulang script ini.");
    // Tunggu sampai login terdeteksi, biar gak langsung nutup browser.
    await new Promise((resolve) => {
      session.once("login_status", ({ isLoggedIn }) => {
        if (isLoggedIn) resolve();
      });
    });
  }

  console.log("Login OK. Menjalankan pengecekan inbox sekali...");

  const monitor = new InboxMonitor(session);

  monitor.on("log", (msg, level) => {
    console.log(`[monitor/${level || "log"}] ${msg}`);
  });

  monitor.on("status", (status) => {
    console.log(">> STATUS:", status);
  });

  monitor.on("new_messages", (data) => {
    console.log(">> ADA PESAN BARU:", data);
  });

  monitor.on("error", (err) => {
    console.error(">> ERROR:", err.message);
  });

  // Jalankan cek SEKALI SAJA (bukan interval terus-terusan), biar gampang dites.
  await monitor._checkOnce();

  console.log("=== Test selesai. Tutup browser dalam 5 detik... ===");
  await new Promise((r) => setTimeout(r, 5000));
  await session.close();
}

main().catch((err) => {
  console.error("Test gagal:", err);
  process.exit(1);
});
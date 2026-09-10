// testing/test-session.js
//
// Script buat NGETES SAJA — bukan bagian dari aplikasi utama. Jalankan
// dengan: npm run test:session
//
// Fungsinya: buka Chromium mode "dev", tunggu kamu login manual, lalu
// pastikan (1) status login kedeteksi, (2) sesi kesimpen ke file, dan
// (3) kalau dijalankan lagi, sesi yang tersimpan langsung kepakai tanpa
// perlu login ulang.

import { MarketplaceSession } from "../src/marketplace/session.js";

const accountId = process.argv[2] || "test-account-1";

const session = new MarketplaceSession({ accountId });

session.on("log", (msg, level) => {
  console.log(`[${level || "log"}] ${msg}`);
});

session.on("login_status", ({ isLoggedIn }) => {
  console.log(`>> login_status berubah: ${isLoggedIn ? "LOGIN" : "LOGOUT"}`);
});

async function main() {
  console.log(`=== Test sesi untuk akun: "${accountId}" ===`);
  await session.open();

  if (session.isLoggedIn) {
    console.log("Sudah login dari sesi tersimpan. Test SELESAI, tidak perlu login manual.");
  } else {
    console.log("Silakan login manual di jendela browser yang terbuka...");
    console.log("Script ini akan otomatis lanjut begitu login terdeteksi.");
  }

  // Tunggu sampai login terdeteksi (atau langsung lanjut kalau sudah login).
  await new Promise((resolve) => {
    if (session.isLoggedIn) return resolve();
    session.once("login_status", ({ isLoggedIn }) => {
      if (isLoggedIn) resolve();
    });
  });

  console.log("Login terdeteksi & sesi tersimpan. Tutup browser dalam 5 detik...");
  await new Promise((r) => setTimeout(r, 5000));
  await session.close();
  console.log("=== Test selesai. Jalankan ulang script ini untuk membuktikan sesi tersimpan bekerja. ===");
}

main().catch((err) => {
  console.error("Test gagal:", err);
  process.exit(1);
});

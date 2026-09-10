// testing/test-rotator.js
//
// Script buat NGETES SAJA. Jalankan:
//   node testing/test-rotator.js akun1 akun2 akun3
//
// (accountId di sini = nama file sesi yang udah pernah kamu buat lewat
// `npm run test:session <nama>`. Kalau belum ada sesinya, akun itu bakal
// di-skip otomatis sama rotator.)

import { AccountRotator } from "../src/rotation/accountRotator.js";

const accountIds = process.argv.slice(2);

if (accountIds.length === 0) {
  console.log("Kasih minimal 1 accountId. Contoh:");
  console.log("  node testing/test-rotator.js akun1 akun2 akun3");
  process.exit(1);
}

const rotator = new AccountRotator(accountIds, {
  delayBetweenAccountsMs: 3000, // jeda 3 detik antar akun (buat testing, dipersingkat)
  roundIntervalMs: 60 * 1000, // 1 menit antar putaran (buat testing, dipersingkat)
});

rotator.on("log", (msg, level) => console.log(`[${level}] ${msg}`));

rotator.on("account_checked", (data) => {
  console.log(">> HASIL:", data);
});

rotator.on("error", ({ accountId, error }) => {
  console.error(`>> ERROR di akun "${accountId}":`, error.message);
});

console.log(`Mulai rotasi untuk ${accountIds.length} akun: ${accountIds.join(", ")}`);
rotator.start();

// Ctrl+C buat berhenti manual
process.on("SIGINT", () => {
  console.log("\nMenghentikan rotasi...");
  rotator.stop();
  process.exit(0);
});
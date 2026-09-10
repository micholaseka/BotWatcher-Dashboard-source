// testing/test-integration.js
//
// Test integrasi: AccountManager + MarketplaceSession beneran disambungkan.
// Ini yang sebelumnya belum ada -- test-account-manager.js cuma menguji
// AccountManager sendirian (updateStatus manual, tanpa buka browser sama
// sekali), jadi loggedIn selalu null di situ. Test ini yang beneran buka
// sesi & lihat status login ter-update dari deteksi cookie asli.
//
// Jalankan salah satu akun dulu (biar gampang diamati):
//   node testing/test-integration.js akun1

import { AccountManager } from "../src/accounts/accountManager.js";
import { MarketplaceSession } from "../src/marketplace/session.js";

async function main() {
  const targetAccountId = process.argv[2];
  if (!targetAccountId) {
    console.error("Pakai: node testing/test-integration.js <accountId>");
    process.exit(1);
  }

  const manager = new AccountManager();
  await manager.load();

  const account = manager.getAccount(targetAccountId);
  if (!account) {
    console.error(`Akun "${targetAccountId}" tidak ditemukan di accounts.json.`);
    process.exit(1);
  }

  manager.on("status", (status) => {
    console.log(">> STATUS berubah:", status);
  });

  manager.updateStatus(account.accountId, { state: "starting" });

  const session = new MarketplaceSession({ accountId: account.accountId });

  // Ini bagian yang sebelumnya belum ada di mana pun: menyambungkan event
  // dari MarketplaceSession ke AccountManager.
  session.on("log", (message, level) => {
    console.log(`[session:${account.accountId}] (${level}) ${message}`);
  });

  session.on("login_status", ({ isLoggedIn }) => {
    manager.updateStatus(account.accountId, {
      loggedIn: isLoggedIn,
      state: isLoggedIn ? "monitoring" : "starting",
    });
  });

  session.on("error", (err) => {
    manager.updateStatus(account.accountId, {
      state: "error",
      error: err.message,
    });
  });

  await session.open();

  console.log(
    "\nSesi dibuka. Status akan ter-update otomatis kalau login terdeteksi.",
  );
  console.log("Status saat ini:", manager.getStatus(account.accountId));
  console.log("(Ctrl+C untuk keluar)");
}

main().catch((err) => {
  console.error("Test integrasi gagal:", err.message);
  process.exit(1);
});
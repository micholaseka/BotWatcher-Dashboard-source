// testing/test-account-manager.js
//
// Validasi manual AccountManager.
// Jalankan setelah accounts.json diisi:
//   node testing/test-account-manager.js

import { AccountManager } from "../src/accounts/accountManager.js";

async function main() {
  const manager = new AccountManager();

  manager.on("loaded", (accounts) => {
    console.log(`>> Loaded ${accounts.length} akun.`);
  });

  manager.on("status", (status) => {
    console.log(">> STATUS:", status);
  });

  await manager.load();

  console.log("Semua akun:", manager.getAccounts());
  console.log("Akun aktif:", manager.getEnabledAccounts());

  for (const account of manager.getEnabledAccounts()) {
    manager.updateStatus(account.accountId, {
      state: "starting",
    });
  }

  console.log("Snapshot status:", manager.getAllStatuses());
  console.log("=== Test AccountManager selesai ===");
}

main().catch((err) => {
  console.error("Test AccountManager gagal:", err.message);
  process.exit(1);
});

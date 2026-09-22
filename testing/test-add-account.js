import fs from "fs";
import os from "os";
import path from "path";

import { AccountManager } from "../src/accounts/accountManager.js";

async function main() {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "botwatcher-account-test-"),
  );

  try {
    const databaseFile = path.join(tempDir, "botwatcher.db");
    const accountId = `test-add-${Date.now()}`;

    const manager = new AccountManager({ databaseFile });
    await manager.load();

    console.log("Menambahkan:", accountId);

    const created = await manager.addAccount({
      accountId,
      name: "Test Account",
      city: "Kediri",
    });

    if (created.accountId !== accountId) {
      throw new Error("Account ID hasil create tidak sesuai.");
    }

    if (created.enabled !== true) {
      throw new Error("Account baru harus langsung aktif.");
    }

    const found = manager.getAccount(accountId);

    if (!found) {
      throw new Error("Account tidak ditemukan setelah dibuat.");
    }

    if (found.enabled !== true) {
      throw new Error("Account tersimpan tidak dalam keadaan aktif.");
    }

    manager.close();

    const managerReloaded = new AccountManager({ databaseFile });
    await managerReloaded.load();

    const persisted = managerReloaded.getAccount(accountId);

    if (!persisted) {
      throw new Error("Account hilang setelah database dibuka ulang.");
    }

    if (persisted.name !== "Test Account" || persisted.city !== "Kediri") {
      throw new Error("Data account tidak persisten dengan benar.");
    }

    await managerReloaded.removeAccount(accountId);

    if (managerReloaded.getAccount(accountId)) {
      throw new Error("Account masih ada setelah dihapus.");
    }

    managerReloaded.close();

    console.log("\nTEST ADD + PERSISTENCE BERHASIL ✅");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("\nTEST GAGAL ❌", error);
  process.exit(1);
});

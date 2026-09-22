import fs from "fs";
import os from "os";
import path from "path";

import { AccountManager } from "../src/accounts/accountManager.js";

async function main() {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "botwatcher-manager-test-"),
  );

  try {
    const databaseFile = path.join(tempDir, "botwatcher.db");
    const manager = new AccountManager({ databaseFile });

    manager.on("loaded", (accounts) => {
      console.log(`>> Loaded ${accounts.length} akun.`);
    });

    manager.on("status", (status) => {
      console.log(">> STATUS:", status);
    });

    await manager.load();

    if (manager.getAccounts().length !== 0) {
      throw new Error("Database test seharusnya mulai tanpa akun.");
    }

    const created = await manager.addAccount({
      accountId: "smoke-account",
      name: "Smoke Account",
      city: "Kediri",
    });

    if (created.enabled !== true) {
      throw new Error("Akun baru harus aktif.");
    }

    const statuses = manager.getAllStatuses();

    if (statuses.length !== 1 || statuses[0]?.accountId !== "smoke-account") {
      throw new Error("Snapshot status akun tidak sesuai.");
    }

    manager.close();

    const reloaded = new AccountManager({ databaseFile });
    await reloaded.load();

    const persisted = reloaded.getAccount("smoke-account");

    if (!persisted) {
      throw new Error("Akun tidak bertahan setelah reload database.");
    }

    console.log("Semua akun:", reloaded.getAccounts());
    console.log("Akun aktif:", reloaded.getEnabledAccounts());
    console.log("Snapshot status:", reloaded.getAllStatuses());
    console.log("=== Test AccountManager selesai ===");

    reloaded.removeAccount("smoke-account");
    reloaded.close();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("Test AccountManager gagal:", error);
  process.exit(1);
});

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
      postCount: 7,
    });

    if (created.enabled !== true) {
      throw new Error("Akun baru harus aktif.");
    }

    if (created.postCount !== 7) {
      throw new Error("postCount harus tersimpan saat akun dibuat.");
    }

    const statuses = manager.getAllStatuses();

    if (statuses.length !== 1 || statuses[0]?.accountId !== "smoke-account") {
      throw new Error("Snapshot status akun tidak sesuai.");
    }

    if (statuses[0]?.postCount !== 7) {
      throw new Error("postCount harus ikut di snapshot status.");
    }

    // postCount tidak diisi harus null (bukan 0): beda "belum diisi".
    const withoutPostCount = await manager.addAccount({
      accountId: "smoke-account-no-post",
      name: "Tanpa Postingan",
    });

    if (withoutPostCount.postCount !== null) {
      throw new Error("postCount harus null kalau tidak diisi.");
    }

    let rejected = false;
    try {
      await manager.addAccount({
        accountId: "smoke-account-invalid",
        name: "Invalid",
        postCount: -3,
      });
    } catch {
      rejected = true;
    }

    if (!rejected) {
      throw new Error("postCount negatif harus ditolak.");
    }

    manager.close();

    const reloaded = new AccountManager({ databaseFile });
    await reloaded.load();

    const persisted = reloaded.getAccount("smoke-account");

    if (!persisted) {
      throw new Error("Akun tidak bertahan setelah reload database.");
    }

    if (persisted.postCount !== 7) {
      throw new Error("postCount tidak bertahan setelah reload database.");
    }

    // Update postCount lewat jalur edit kartu akun, harus bertahan.
    const updated = await reloaded.updateAccount("smoke-account", {
      postCount: 12,
    });

    if (updated.postCount !== 12) {
      throw new Error("postCount gagal diupdate.");
    }

    const updatedReloaded = new AccountManager({ databaseFile });
    await updatedReloaded.load();

    if (updatedReloaded.getAccount("smoke-account").postCount !== 12) {
      throw new Error("postCount baru tidak bertahan setelah reload.");
    }

    // Kosongkan lagi -> null.
    await updatedReloaded.updateAccount("smoke-account", { postCount: null });

    if (updatedReloaded.getAccount("smoke-account").postCount !== null) {
      throw new Error("postCount gagal dikosongkan.");
    }

    updatedReloaded.close();

    console.log("Semua akun:", reloaded.getAccounts());
    console.log("Akun aktif:", reloaded.getEnabledAccounts());
    console.log("Snapshot status:", reloaded.getAllStatuses());
    console.log("=== Test AccountManager selesai ===");

    reloaded.removeAccount("smoke-account");
    reloaded.removeAccount("smoke-account-no-post");
    reloaded.close();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("Test AccountManager gagal:", error);
  process.exit(1);
});

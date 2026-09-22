import { AccountManager } from "../src/accounts/accountManager.js";

async function main() {
  const manager = new AccountManager();

  await manager.load();

  const accountId = `test-add-${Date.now()}`;

  console.log("Menambahkan:", accountId);

  const created = await manager.addAccount({
    accountId,
    name: "Test Account",
    city: "Kediri",
  });

  console.log("\nAKUN DIBUAT:");
  console.log(created);

  const found = manager.getAccount(accountId);

  if (!found) {
    throw new Error("Account tidak ditemukan setelah dibuat.");
  }

  if (found.enabled !== false) {
    throw new Error("Account baru seharusnya disabled.");
  }

  await manager.removeAccount(accountId);

  const removed = manager.getAccount(accountId);

  if (removed) {
    throw new Error("Account masih ada setelah dihapus.");
  }

  console.log("\nTEST ADD ACCOUNT BERHASIL ✅");

  manager.close();
}

main().catch((error) => {
  console.error("\nTEST GAGAL ❌", error);

  process.exit(1);
});

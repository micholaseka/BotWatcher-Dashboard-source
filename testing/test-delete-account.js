import { AccountManager } from "../src/accounts/accountManager.js";

async function main() {
  const manager = new AccountManager();

  await manager.load();

  console.log("SEBELUM:");
  console.table(manager.getAccounts());

  const account = manager.getAccounts()[0];

  if (!account) {
    throw new Error("Tidak ada akun untuk dites.");
  }

  console.log(`\nMenghapus: ${account.accountId}`);

  await manager.removeAccount(account.accountId);

  console.log("\nSESUDAH:");
  console.table(manager.getAccounts());

  manager.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

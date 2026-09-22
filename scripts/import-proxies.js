import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { AccountManager } from "../src/accounts/accountManager.js";
import { parseProxyCsv } from "../src/proxy/proxyCsv.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const csvPath = process.argv[2];

if (!csvPath) {
  console.error("Usage: pnpm import:proxies <file.csv>");
  process.exit(1);
}

const filePath = path.resolve(process.cwd(), csvPath);

async function main() {
  const text = await fs.readFile(filePath, "utf8");
  const parsed = parseProxyCsv(text);

  const manager = new AccountManager({
    databaseFile: path.join(
      PROJECT_ROOT,
      "storage",
      "botwatcher.db",
    ),
  });

  try {
    await manager.load();
    const result = await manager.importProxyRows(parsed.rows);
    const errors = [...parsed.errors, ...result.errors];

    console.log("\n=== IMPORT PROXY ===\n");
    console.log(`File        : ${filePath}`);
    console.log(`Total baris : ${parsed.rows.length + parsed.errors.length}`);
    console.log(`Berhasil    : ${result.imported}`);
    console.log(`Gagal       : ${errors.length}`);

    if (errors.length > 0) {
      console.log("\nError:");
      for (const error of errors) {
        const line = error.line ? ` (baris ${error.line})` : "";
        console.log(`- ${error.accountId || "-"}${line}: ${error.message}`);
      }
    }
  } finally {
    manager.close();
  }
}

main().catch((error) => {
  console.error("\nImport gagal:");
  console.error(error);
  process.exit(1);
});

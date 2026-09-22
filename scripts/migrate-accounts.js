import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createDatabase } from "../src/database/database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const accountsFile = path.join(PROJECT_ROOT, "accounts.json");
const databaseFile = path.join(PROJECT_ROOT, "storage", "botwatcher.db");

function main() {
  if (!fs.existsSync(accountsFile)) {
    throw new Error(`File tidak ditemukan: ${accountsFile}`);
  }

  const raw = fs.readFileSync(accountsFile, "utf8");
  const data = JSON.parse(raw);

  if (!Array.isArray(data.accounts)) {
    throw new Error('accounts.json harus memiliki field "accounts".');
  }

  const db = createDatabase(databaseFile);

  const insertAccount = db.prepare(`
    INSERT INTO accounts (
      account_id,
      name,
      city,
      enabled
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(account_id)
    DO UPDATE SET
      name = excluded.name,
      city = excluded.city,
      enabled = excluded.enabled,
      updated_at = CURRENT_TIMESTAMP
  `);

  const insertStatus = db.prepare(`
    INSERT INTO account_status (
      account_id,
      state
    )
    VALUES (?, 'idle')
    ON CONFLICT(account_id) DO NOTHING
  `);

  db.exec("BEGIN");

  try {
    for (const account of data.accounts) {
      const accountId = String(account.accountId ?? "").trim();
      const name = String(account.name ?? accountId).trim();
      const city = String(account.city ?? "").trim();
      const enabled = account.enabled === false ? 0 : 1;

      if (!accountId) {
        throw new Error("Ada akun tanpa accountId.");
      }

      if (!name) {
        throw new Error(`Nama akun kosong: ${accountId}`);
      }

      insertAccount.run(accountId, name, city, enabled);

      insertStatus.run(accountId);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const rows = db
    .prepare(
      `
      SELECT
        account_id,
        name,
        city,
        enabled
      FROM accounts
      ORDER BY id
    `,
    )
    .all();

  console.log(`\nMigration selesai.`);
  console.log(`Database: ${databaseFile}`);
  console.log(`Jumlah akun: ${rows.length}\n`);

  console.table(rows);

  db.close();
}

try {
  main();
} catch (error) {
  console.error("\nMigration gagal:");
  console.error(error);
  process.exit(1);
}

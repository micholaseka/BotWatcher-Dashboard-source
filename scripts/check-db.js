// scripts/check-db.js
//
// Cek isi database BotWatcher: jumlah akun, status terakhir tiap akun,
// dan kolom penting (post_count). Berguna untuk memastikan migrasi
// database sudah masuk dan data akun masih utuh.
//
// Database dicek (urut prioritas):
//   1. env BOTWATCHER_DB          -> path database langsung
//   2. env BOTWATCHER_DATA_DIR    -> <dir>/botwatcher.db
//   3. ~/.config/Electron/botwatcher.db  (default mode dev)
//
// Jalankan: pnpm run db:check

import fs from "fs";
import os from "os";
import path from "path";

import { createDatabase } from "../src/database/database.js";

function resolveDatabaseFile() {
  if (process.env.BOTWATCHER_DB) {
    return process.env.BOTWATCHER_DB;
  }

  if (process.env.BOTWATCHER_DATA_DIR) {
    return path.join(process.env.BOTWATCHER_DATA_DIR, "botwatcher.db");
  }

  return path.join(os.homedir(), ".config", "Electron", "botwatcher.db");
}

const databaseFile = resolveDatabaseFile();

if (!fs.existsSync(databaseFile)) {
  console.error(`Database tidak ditemukan: ${databaseFile}`);
  console.error(
    "Isi BOTWATCHER_DB=/path/botwatcher.db kalau database-nya di tempat lain.",
  );
  process.exit(1);
}

const db = createDatabase(databaseFile);

const accountCount = db
  .prepare("SELECT COUNT(*) AS total FROM accounts")
  .get().total;

const statusCounts = db
  .prepare(
    `SELECT COALESCE(state, 'idle') AS state, COUNT(*) AS total
     FROM account_status GROUP BY state`,
  )
  .all();

const rows = db
  .prepare(
    `SELECT
       a.account_id,
       a.name,
       a.city,
       a.post_count,
       COALESCE(s.state, 'idle') AS state,
       s.logged_in,
       s.unread_count
     FROM accounts a
     LEFT JOIN account_status s ON s.account_id = a.account_id
     ORDER BY a.id`,
  )
  .all();

console.log(`Database: ${databaseFile}`);
console.log(`Jumlah akun: ${accountCount}`);
console.log("\nStatus akun:");
console.table(statusCounts);
console.log("Detail:");
console.table(rows);

db.close();

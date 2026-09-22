import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

export function createDatabase(dbPath) {
  const directory = path.dirname(dbPath);
  fs.mkdirSync(directory, { recursive: true });

  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS account_proxy (
  account_id TEXT PRIMARY KEY,
  server TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (account_id)
    REFERENCES accounts(account_id)
    ON DELETE CASCADE
);

    CREATE TABLE IF NOT EXISTS account_status (
      account_id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'idle',
      logged_in INTEGER,
      unread_count INTEGER,
      last_checked_at TEXT,
      last_error TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (account_id)
        REFERENCES accounts(account_id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS monitor_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      unread_count INTEGER,
      message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (account_id)
        REFERENCES accounts(account_id)
        ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_monitor_events_account
      ON monitor_events(account_id);

    CREATE INDEX IF NOT EXISTS idx_monitor_events_created
      ON monitor_events(created_at);
  `);

  return db;
}

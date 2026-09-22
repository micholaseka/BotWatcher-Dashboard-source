// src/accounts/accountManager.js
//
// Mengelola daftar akun dari accounts.json dan status runtime tiap akun.
// AccountManager sengaja tidak membuka browser; tugasnya hanya:
//   1. load + validasi konfigurasi akun
//   2. menyediakan daftar akun aktif
//   3. tracking status runtime per akun
//
// Struktur ini mengikuti alur:
// AccountManager -> MarketplaceSession -> InboxMonitor

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { EventEmitter } from "events";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

export const DEFAULT_ACCOUNTS_FILE = path.join(PROJECT_ROOT, "accounts.json");

const VALID_STATUSES = new Set([
  "idle",
  "starting",
  "monitoring",
  "stopped",
  "offline",
  "error",
]);

export class AccountManager extends EventEmitter {
  constructor({ accountsFile = DEFAULT_ACCOUNTS_FILE } = {}) {
    super();
    this.accountsFile = accountsFile;
    this.accounts = [];
    this.status = new Map();
    this.loaded = false;
  }

  async updateAccount(accountId, patch = {}) {
    const index = this.accounts.findIndex(
      (item) => item.accountId === accountId,
    );
    if (index === -1) {
      throw new Error(`Akun "${accountId}" tidak terdaftar.`);
    }

    const current = this.accounts[index];
    const name =
      patch.name !== undefined ? String(patch.name).trim() : current.name;
    const city =
      patch.city !== undefined ? String(patch.city).trim() : current.city;

    if (!name) {
      throw new Error("Nama akun tidak boleh kosong.");
    }

    const updated = Object.freeze({ ...current, name, city });
    const nextAccounts = [...this.accounts];
    nextAccounts[index] = updated;
    this.accounts = nextAccounts;

    await this._persist();
    this.updateStatus(accountId, { name, city });
    this.emit("account_updated", updated);

    return { ...updated };
  }

  async _persist() {
    const payload = {
      accounts: this.accounts.map(({ accountId, name, city, enabled }) => ({
        accountId,
        name,
        city,
        enabled,
      })),
    };
    await fs.writeFile(
      this.accountsFile,
      JSON.stringify(payload, null, 2) + "\n",
      "utf8",
    );
  }

  async load() {
    const raw = await fs.readFile(this.accountsFile, "utf8");

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`accounts.json bukan JSON yang valid: ${err.message}`);
    }

    this.accounts = this._validate(parsed);

    for (const account of this.accounts) {
      if (!this.status.has(account.accountId)) {
        this.status.set(account.accountId, {
          accountId: account.accountId,
          name: account.name,
          city: account.city,
          enabled: account.enabled,
          state: "idle",
          loggedIn: null,
          unreadCount: null,
          lastCheckedAt: null,
          error: null,
        });
      }
    }

    // Hapus status akun yang sudah dihapus dari accounts.json.
    const validIds = new Set(this.accounts.map((account) => account.accountId));
    for (const accountId of this.status.keys()) {
      if (!validIds.has(accountId)) this.status.delete(accountId);
    }

    this.loaded = true;
    this.emit("loaded", this.getAccounts());
    return this.getAccounts();
  }

  _validate(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(
        'Root accounts.json harus berupa object dengan field "accounts".',
      );
    }

    if (!Array.isArray(data.accounts)) {
      throw new Error('Field "accounts" harus berupa array.');
    }

    const seen = new Set();

    return data.accounts.map((account, index) => {
      if (!account || typeof account !== "object" || Array.isArray(account)) {
        throw new Error(`accounts[${index}] harus berupa object.`);
      }

      const accountId = String(account.accountId ?? "").trim();
      const name = String(account.name ?? accountId).trim();
      const enabled = account.enabled !== false;
      const city = String(account.city ?? "").trim();

      if (!accountId) {
        throw new Error(`accounts[${index}].accountId wajib diisi.`);
      }

      if (seen.has(accountId)) {
        throw new Error(`Duplikat accountId ditemukan: "${accountId}".`);
      }

      if (!name) {
        throw new Error(`accounts[${index}].name tidak boleh kosong.`);
      }

      seen.add(accountId);

      return Object.freeze({
        accountId,
        name,
        city,
        enabled,
      });
    });
  }

  getAccounts() {
    return this.accounts.map((account) => ({ ...account }));
  }

  getEnabledAccounts() {
    return this.getAccounts().filter((account) => account.enabled);
  }

  getAccount(accountId) {
    const account = this.accounts.find((item) => item.accountId === accountId);
    return account ? { ...account } : null;
  }

  getStatus(accountId) {
    const item = this.status.get(accountId);
    return item ? { ...item } : null;
  }

  getAllStatuses() {
    return this.accounts.map((account) => this.getStatus(account.accountId));
  }

  updateStatus(accountId, patch = {}) {
    const account = this.getAccount(accountId);
    if (!account) {
      throw new Error(`Akun "${accountId}" tidak terdaftar.`);
    }

    const current = this.status.get(accountId) ?? {
      accountId,
      name: account.name,
      city: account.city,
      enabled: account.enabled,
      state: "idle",
      loggedIn: null,
      unreadCount: null,
      lastCheckedAt: null,
      error: null,
    };

    if (patch.state !== undefined && !VALID_STATUSES.has(patch.state)) {
      throw new Error(
        `Status tidak valid: "${patch.state}". Gunakan: ${[
          ...VALID_STATUSES,
        ].join(", ")}.`,
      );
    }

    const next = {
      ...current,
      ...patch,
      accountId,
      name: account.name,
      city: account.city,
      enabled: account.enabled,
    };

    this.status.set(accountId, next);
    this.emit("status", { ...next });
    return { ...next };
  }

  resetStatuses() {
    for (const account of this.accounts) {
      this.updateStatus(account.accountId, {
        state: "idle",
        loggedIn: null,
        unreadCount: null,
        lastCheckedAt: null,
        error: null,
      });
    }
  }
}

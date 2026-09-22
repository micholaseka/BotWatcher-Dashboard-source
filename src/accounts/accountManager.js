import path from "path";
import { fileURLToPath } from "url";
import { EventEmitter } from "events";

import { createDatabase } from "../database/database.js";
import { AccountRepository } from "./accountRepository.js";
import { deleteDevSession } from "../storage/sessionStorage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

export function getDefaultDatabaseFile() {
  const dataRoot =
    process.env.BOTWATCHER_DATA_DIR || PROJECT_ROOT;

  return path.join(
    dataRoot,
    "botwatcher.db",
  );
}

const VALID_STATUSES = new Set([
  "idle",
  "starting",
  "monitoring",
  "stopped",
  "offline",
  "error",
]);

function mapAccount(row) {
  return {
    accountId: row.account_id,
    name: row.name,
    city: row.city ?? "",
    enabled: Boolean(row.enabled),

    proxyConfigured: Boolean(row.proxy_configured),

    proxyServer: row.proxy_server ?? null,

    proxyUsername: row.proxy_username ?? null,
  };
}

function mapStatus(account, row) {
  return {
    accountId: account.accountId,
    name: account.name,
    city: account.city,
    enabled: account.enabled,

    proxyConfigured: account.proxyConfigured ?? false,

    proxyServer: account.proxyServer ?? null,

    proxyUsername: account.proxyUsername ?? null,

    state: row?.state ?? "idle",

    loggedIn:
      row?.logged_in === null || row?.logged_in === undefined
        ? null
        : Boolean(row.logged_in),

    unreadCount:
      row?.unread_count === null || row?.unread_count === undefined
        ? null
        : Number(row.unread_count),

    lastCheckedAt: row?.last_checked_at ? new Date(row.last_checked_at) : null,

    error: row?.last_error ?? null,
  };
}

export class AccountManager extends EventEmitter {
  constructor({ databaseFile = getDefaultDatabaseFile() } = {}) {
    super();

    this.databaseFile = databaseFile;

    this.db = null;
    this.repository = null;

    this.accounts = [];
    this.status = new Map();

    this.loaded = false;
  }

  async load() {
    if (this.loaded) {
      return this.getAccounts();
    }

    this.db = createDatabase(this.databaseFile);
    this.repository = new AccountRepository(this.db);
    this.db
      .prepare(
        `
        UPDATE accounts
        SET enabled = 1
        WHERE enabled != 1
`,
      )
      .run();

    const rows = this.repository.listAccountsWithStatus();

    this.accounts = rows.map(mapAccount);

    this.status.clear();

    for (const row of rows) {
      const account = mapAccount(row);

      this.repository.ensureStatus(account.accountId);

      const savedStatus = this.repository.getStatus(account.accountId);

      this.status.set(account.accountId, mapStatus(account, savedStatus));
    }

    this.loaded = true;

    this.emit("loaded", this.getAccounts());

    return this.getAccounts();
  }

  getAccounts() {
    return this.accounts.map((account) => ({
      ...account,
    }));
  }

  getEnabledAccounts() {
    return this.getAccounts();
  }

  getAccount(accountId) {
    const account = this.accounts.find((item) => item.accountId === accountId);

    return account
      ? {
          ...account,
        }
      : null;
  }

  getStatus(accountId) {
    const status = this.status.get(accountId);

    return status
      ? {
          ...status,
        }
      : null;
  }

  getAllStatuses() {
    return this.accounts.map((account) => this.getStatus(account.accountId));
  }

  async updateAccount(accountId, patch = {}) {
    const current = this.getAccount(accountId);

    if (!current) {
      throw new Error(`Akun "${accountId}" tidak terdaftar.`);
    }

    const name =
      patch.name !== undefined ? String(patch.name).trim() : current.name;

    const city =
      patch.city !== undefined ? String(patch.city).trim() : current.city;

    if (!name) {
      throw new Error("Nama akun tidak boleh kosong.");
    }

    this.repository.updateAccount(accountId, {
      name,
      city,
    });

    const index = this.accounts.findIndex(
      (item) => item.accountId === accountId,
    );

    this.accounts[index] = {
      ...this.accounts[index],
      name,
      city,
    };

    const oldStatus = this.status.get(accountId);

    if (oldStatus) {
      this.status.set(accountId, {
        ...oldStatus,
        name,
        city,
      });
    }

    const updated = this.getAccount(accountId);

    this.emit("account_updated", updated);

    this.emit("status", this.getStatus(accountId));

    return updated;
  }

  async addAccount({ accountId, name, city = "" } = {}) {
    if (!this.loaded || !this.repository) {
      throw new Error("AccountManager belum dimuat.");
    }

    const normalizedId = String(accountId ?? "").trim();
    const normalizedName = String(name ?? "").trim();
    const normalizedCity = String(city ?? "").trim();

    if (!normalizedId) {
      throw new Error("Account ID tidak boleh kosong.");
    }

    if (!/^[A-Za-z0-9_-]+$/.test(normalizedId)) {
      throw new Error(
        "Account ID hanya boleh berisi huruf, angka, underscore (_) dan tanda minus (-).",
      );
    }

    if (!normalizedName) {
      throw new Error("Nama akun tidak boleh kosong.");
    }

    if (this.getAccount(normalizedId)) {
      throw new Error(`Account ID "${normalizedId}" sudah digunakan.`);
    }

    this.repository.createAccount({
      accountId: normalizedId,
      name: normalizedName,
      city: normalizedCity,
    });

    const account = {
      accountId: normalizedId,
      name: normalizedName,
      city: normalizedCity,
      enabled: true,
      proxyConfigured: false,
      proxyServer: null,
      proxyUsername: null,
    };

    this.accounts.push(account);

    const status = mapStatus(account, null);

    this.status.set(normalizedId, status);

    this.emit("account_added", status);

    this.emit("status", status);

    return {
      ...status,
    };
  }

  async removeAccount(accountId) {
    const account = this.getAccount(accountId);

    if (!account) {
      throw new Error(`Akun "${accountId}" tidak ditemukan.`);
    }

    this.repository.deleteAccount(accountId);

    this.accounts = this.accounts.filter(
      (item) => item.accountId !== accountId,
    );

    this.status.delete(accountId);

    // Hapus session Playwright dev.
    await deleteDevSession(accountId);

    this.emit("account_removed", {
      ...account,
    });

    return {
      ...account,
    };
  }

  updateStatus(accountId, patch = {}) {
    const account = this.getAccount(accountId);

    if (!account) {
      throw new Error(`Akun "${accountId}" tidak terdaftar.`);
    }

    if (patch.state !== undefined && !VALID_STATUSES.has(patch.state)) {
      throw new Error(
        `Status tidak valid: "${patch.state}". ` +
          `Gunakan: ${[...VALID_STATUSES].join(", ")}.`,
      );
    }

    const current = this.status.get(accountId) ?? mapStatus(account, null);

    const next = {
      ...current,
      ...patch,

      accountId,
      name: account.name,
      city: account.city,
      enabled: account.enabled,
    };

    this.repository.updateStatus(accountId, next);

    this.status.set(accountId, next);

    this.emit("status", {
      ...next,
    });

    return {
      ...next,
    };
  }

  getProxy(accountId) {
    const account = this.getAccount(accountId);

    if (!account) {
      throw new Error(`Akun "${accountId}" tidak ditemukan.`);
    }

    return this.repository.getProxy(accountId);
  }

  async setProxy(accountId, proxy) {
    const server = String(proxy.server ?? "").trim();
    const username = String(proxy.username ?? "").trim();
    const password = String(proxy.password ?? "");

    if (!server) {
      throw new Error("Proxy server wajib diisi.");
    }

    const updatedProxy = this.repository.setProxy(accountId, {
      server,
      username,
      password,
    });

    const account = this.getAccount(accountId);

    const currentStatus =
      this.status.get(accountId) ?? mapStatus(account, null);

    const updatedStatus = {
      ...currentStatus,
      proxyConfigured: true,
      proxyServer: updatedProxy.server,
      proxyUsername: updatedProxy.username,
    };

    this.status.set(accountId, updatedStatus);

    this.emit("status", updatedStatus);

    return updatedStatus;
  }

  async removeProxy(accountId) {
    const account = this.getAccount(accountId);

    if (!account) {
      throw new Error(`Akun "${accountId}" tidak ditemukan.`);
    }

    this.repository.deleteProxy(accountId);

    const currentStatus =
      this.status.get(accountId) ?? mapStatus(account, null);

    const updatedStatus = {
      ...currentStatus,
      proxyConfigured: false,
      proxyServer: null,
      proxyUsername: null,
    };

    this.status.set(accountId, updatedStatus);

    this.emit("status", updatedStatus);

    return updatedStatus;
  }

  async importProxyRows(rows) {
    if (!this.loaded) {
      await this.load();
    }

    const validRows = [];
    const errors = [];

    for (const row of rows) {
      const account = this.getAccount(row.accountId);

      if (!account) {
        errors.push({
          line: null,
          accountId: row.accountId,
          message: "Account ID tidak ditemukan.",
        });
        continue;
      }

      validRows.push(row);
    }

    if (validRows.length > 0) {
      this.repository.bulkUpsertProxies(validRows);

      for (const row of validRows) {
        const account = this.getAccount(row.accountId);

        const currentStatus =
          this.status.get(row.accountId) ?? mapStatus(account, null);

        this.status.set(row.accountId, {
          ...currentStatus,

          proxyConfigured: true,
          proxyServer: row.server,
          proxyUsername: row.username ?? null,
        });
      }
    }

    return {
      total: rows.length,
      imported: validRows.length,
      failed: errors.length,
      errors,
      accounts: this.getAllStatuses(),
    };
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

  close() {
    if (this.repository) {
      this.repository.close();
    }

    this.repository = null;
    this.db = null;
    this.loaded = false;
  }
}

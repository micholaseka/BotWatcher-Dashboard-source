import { createDatabase } from "../database/database.js";

export class AccountRepository {
  constructor(db) {
    this.db = db;
  }

  createAccount({ accountId, name, city = "" }) {
    this.db.exec("BEGIN");

    try {
      this.db
        .prepare(
          `
        INSERT INTO accounts (
          account_id,
          name,
          city,
          enabled
        )
        VALUES (?, ?, ?, 1)
        `,
        )
        .run(accountId, name, city);

      this.db
        .prepare(
          `
        INSERT INTO account_status (
          account_id,
          state,
          logged_in,
          unread_count,
          last_checked_at,
          last_error
        )
        VALUES (?, 'idle', NULL, NULL, NULL, NULL)
        `,
        )
        .run(accountId);

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");

      if (
        String(error.message).includes(
          "UNIQUE constraint failed: accounts.account_id",
        )
      ) {
        throw new Error(`Account ID "${accountId}" sudah digunakan.`);
      }

      throw error;
    }
  }

  listAccountsWithStatus() {
    return this.db
      .prepare(
        `
      SELECT
        a.account_id,
        a.name,
        a.city,
        a.enabled,

        COALESCE(s.state, 'idle') AS state,
        s.logged_in,
        s.unread_count,
        s.last_checked_at,
        s.last_error,

        CASE
          WHEN p.account_id IS NOT NULL THEN 1
          ELSE 0
        END AS proxy_configured,

        p.server AS proxy_server,
        p.username AS proxy_username

      FROM accounts a

      LEFT JOIN account_status s
        ON s.account_id = a.account_id

      LEFT JOIN account_proxy p
        ON p.account_id = a.account_id

      ORDER BY a.id
    `,
      )
      .all();
  }
  getAccount(accountId) {
    return this.db
      .prepare(
        `
        SELECT
          account_id,
          name,
          city,
          enabled
        FROM accounts
        WHERE account_id = ?
      `,
      )
      .get(accountId);
  }

  updateAccount(accountId, { name, city }) {
    const result = this.db
      .prepare(
        `
        UPDATE accounts
        SET
          name = ?,
          city = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE account_id = ?
      `,
      )
      .run(name, city, accountId);

    if (result.changes === 0) {
      throw new Error(`Akun "${accountId}" tidak ditemukan.`);
    }
  }

  deleteAccount(accountId) {
    const result = this.db
      .prepare(
        `
        DELETE FROM accounts
        WHERE account_id = ?
      `,
      )
      .run(accountId);

    if (result.changes === 0) {
      throw new Error(`Akun "${accountId}" tidak ditemukan.`);
    }
  }

  ensureStatus(accountId) {
    this.db
      .prepare(
        `
        INSERT INTO account_status (
          account_id,
          state
        )
        VALUES (?, 'idle')
        ON CONFLICT(account_id) DO NOTHING
      `,
      )
      .run(accountId);
  }

  updateStatus(accountId, status) {
    this.ensureStatus(accountId);

    this.db
      .prepare(
        `
        UPDATE account_status
        SET
          state = ?,
          logged_in = ?,
          unread_count = ?,
          last_checked_at = ?,
          last_error = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE account_id = ?
      `,
      )
      .run(
        status.state,
        status.loggedIn === null || status.loggedIn === undefined
          ? null
          : status.loggedIn
            ? 1
            : 0,
        status.unreadCount ?? null,
        status.lastCheckedAt
          ? new Date(status.lastCheckedAt).toISOString()
          : null,
        status.error ?? null,
        accountId,
      );
  }

  getStatus(accountId) {
    return this.db
      .prepare(
        `
        SELECT
          account_id,
          state,
          logged_in,
          unread_count,
          last_checked_at,
          last_error
        FROM account_status
        WHERE account_id = ?
      `,
      )
      .get(accountId);
  }

  getProxy(accountId) {
    return (
      this.db
        .prepare(
          `
        SELECT
          account_id,
          server,
          username,
          password
        FROM account_proxy
        WHERE account_id = ?
      `,
        )
        .get(accountId) ?? null
    );
  }

  setProxy(accountId, { server, username = "", password = "" }) {
    const account = this.getAccount(accountId);

    if (!account) {
      throw new Error(`Akun "${accountId}" tidak ditemukan.`);
    }

    this.db
      .prepare(
        `
      INSERT INTO account_proxy (
        account_id,
        server,
        username,
        password
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(account_id)
      DO UPDATE SET
        server = excluded.server,
        username = excluded.username,
        password = excluded.password,
        updated_at = CURRENT_TIMESTAMP
    `,
      )
      .run(accountId, server, username, password);

    return this.getProxy(accountId);
  }

  deleteProxy(accountId) {
    this.db
      .prepare(
        `
      DELETE FROM account_proxy
      WHERE account_id = ?
    `,
      )
      .run(accountId);
  }

  bulkUpsertProxies(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return 0;
    }

    const statement = this.db.prepare(`
    INSERT INTO account_proxy (
      account_id,
      server,
      username,
      password
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(account_id)
    DO UPDATE SET
      server = excluded.server,
      username = excluded.username,
      password = excluded.password,
      updated_at = CURRENT_TIMESTAMP
  `);

    this.db.exec("BEGIN IMMEDIATE");

    try {
      for (const row of rows) {
        statement.run(
          row.accountId,
          row.server,
          row.username ?? "",
          row.password ?? "",
        );
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return rows.length;
  }

  close() {
    this.db.close();
  }
}

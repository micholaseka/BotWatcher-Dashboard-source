// src/proxy/proxyCsv.js

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "socks5:", "socks5h:"]);

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const source = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = false;
        continue;
      }

      field += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char === "\r") {
      if (next === "\n") {
        continue;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error("CSV tidak valid: tanda kutip tidak tertutup.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((currentRow) =>
    currentRow.some((value) => value.trim() !== ""),
  );
}

function validateProxyServer(server) {
  let parsed;

  try {
    parsed = new URL(server);
  } catch {
    return "Format server proxy tidak valid.";
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return "Protocol proxy harus http, https, socks5, atau socks5h.";
  }

  if (!parsed.hostname) {
    return "Hostname proxy kosong.";
  }

  return null;
}

export function parseProxyCsv(text) {
  const matrix = parseCsvText(text);

  if (matrix.length === 0) {
    throw new Error("File CSV kosong.");
  }

  const headers = matrix[0].map((value) => value.trim().toLowerCase());

  const requiredHeaders = ["account_id", "server"];

  for (const required of requiredHeaders) {
    if (!headers.includes(required)) {
      throw new Error(`Kolom "${required}" tidak ditemukan.`);
    }
  }

  const columnIndex = new Map();

  headers.forEach((header, index) => {
    columnIndex.set(header, index);
  });

  const rows = [];
  const errors = [];
  const seenAccountIds = new Set();

  for (let index = 1; index < matrix.length; index += 1) {
    const currentRow = matrix[index];
    const lineNumber = index + 1;

    const accountId = (currentRow[columnIndex.get("account_id")] ?? "").trim();

    const server = (currentRow[columnIndex.get("server")] ?? "").trim();

    const username = (currentRow[columnIndex.get("username")] ?? "").trim();

    const password = currentRow[columnIndex.get("password")] ?? "";

    if (!accountId) {
      errors.push({
        line: lineNumber,
        accountId: "",
        message: "account_id kosong.",
      });
      continue;
    }

    if (!server) {
      errors.push({
        line: lineNumber,
        accountId,
        message: "server proxy kosong.",
      });
      continue;
    }

    if (seenAccountIds.has(accountId)) {
      errors.push({
        line: lineNumber,
        accountId,
        message: "account_id duplikat di CSV.",
      });
      continue;
    }

    const proxyError = validateProxyServer(server);

    if (proxyError) {
      errors.push({
        line: lineNumber,
        accountId,
        message: proxyError,
      });
      continue;
    }

    seenAccountIds.add(accountId);

    rows.push({
      accountId,
      server,
      username,
      password,
    });
  }

  return {
    rows,
    errors,
  };
}

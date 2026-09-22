import fs from "fs/promises";
import path from "path";

import { getSessionConfig, ENGINE_MODE } from "../config/engine.config.js";

/**
 * Hapus sesi login Dev Chromium untuk satu akun.
 * Mode chrome-portable tidak menyimpan storageState di folder ini,
 * jadi fungsi tersebut sengaja tidak melakukan apa-apa pada mode itu.
 */
export async function deleteDevSession(accountId) {
  if (ENGINE_MODE !== "dev") return false;

  const normalizedId = String(accountId ?? "").trim();
  if (!normalizedId) return false;

  const sessionDirectory = path.resolve(
    getSessionConfig().sessionDirectory,
  );

  const sessionFile = path.resolve(
    sessionDirectory,
    `${normalizedId}.json`,
  );

  // Jangan pernah mengizinkan accountId keluar dari folder session.
  const relative = path.relative(
    sessionDirectory,
    sessionFile,
  );

  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Lokasi sesi akun tidak valid.");
  }

  try {
    await fs.rm(sessionFile, { force: true });
    return true;
  } catch (error) {
    throw new Error(
      `Gagal menghapus sesi akun "${normalizedId}": ${error.message}`
    );
  }
}

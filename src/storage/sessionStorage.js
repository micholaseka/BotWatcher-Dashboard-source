import fs from "fs/promises";
import path from "path";

import { getSessionConfig, ENGINE_MODE } from "../config/engine.config.js";

/**
 * Hapus sesi login Dev Chromium untuk satu akun:
 *   1. folder profil permanen (tempat cookie/localStorage tersimpan).
 *   2. file storageState.json lama, kalau masih ada (sisa pola sebelum
 *      profil permanen dipakai).
 * Mode chrome-portable tidak menyimpan apa pun di folder ini, jadi
 * fungsi ini sengaja tidak melakukan apa-apa pada mode itu.
 */
export async function deleteDevSession(accountId) {
  if (ENGINE_MODE !== "dev") return false;

  const normalizedId = String(accountId ?? "").trim();
  if (!normalizedId) return false;

  const config = getSessionConfig();

  const sessionDirectory = path.resolve(config.sessionDirectory);
  const profileDirectory = path.resolve(config.profileDirectory);

  const sessionFile = path.resolve(
    sessionDirectory,
    `${normalizedId}.json`,
  );

  const profileDirectoryAccount = path.resolve(
    profileDirectory,
    normalizedId,
  );

  // Jangan pernah mengizinkan accountId keluar dari folder yang ditentukan.
  for (const [base, target] of [
    [sessionDirectory, sessionFile],
    [profileDirectory, profileDirectoryAccount],
  ]) {
    const relative = path.relative(base, target);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Lokasi sesi akun tidak valid.");
    }
  }

  try {
    await fs.rm(profileDirectoryAccount, { recursive: true, force: true });
    await fs.rm(sessionFile, { force: true });

    return true;
  } catch (error) {
    throw new Error(
      `Gagal menghapus sesi akun "${normalizedId}": ${error.message}`
    );
  }
}

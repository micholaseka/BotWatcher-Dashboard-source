import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

export const SESSION_DIRECTORY = path.join(PROJECT_ROOT, "storage", "sessions");

export async function deleteDevSession(accountId) {
  const sessionFile = path.join(SESSION_DIRECTORY, `${accountId}.json`);

  try {
    await fs.unlink(sessionFile);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function sessionExists(accountId) {
  const sessionFile = path.join(SESSION_DIRECTORY, `${accountId}.json`);

  try {
    await fs.access(sessionFile);
    return true;
  } catch {
    return false;
  }
}

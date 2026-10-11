// src/config/engine.config.js
//
// Satu tempat buat atur "browser apa yang dipakai" tanpa harus ubah kode
// di tempat lain. Ganti ENGINE_MODE (atau isi env var ENGINE_MODE) kalau
// pindah dari laptop Ubuntu (testing) ke Windows (produksi).
//
//   dev            -> Chromium via patchright (Playwright ter-patch anti-bot),
//                      profil PERMANEN per akun di storage/profiles/
//                      (cookie/localStorage/cache tersimpan). Dipakai
//                      sekarang di Ubuntu untuk development & testing.
//   chrome-portable -> Chrome Portable asli di Windows, baca sesi langsung
//                      dari folder profil Chrome yang sudah login (Profile 1,
//                      Profile 2, dst). Dipakai nanti saat aplikasi jadi.

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

export const ENGINE_MODE = process.env.ENGINE_MODE || "dev"; // "dev" | "chrome-portable"

export const engineConfig = {
  // ---- Mode "dev": Chromium patchright dengan profil permanen ----
  dev: {
    // Folder profil Chromium PERMANEN per akun (cookie, localStorage,
    // cache, IndexedDB ikut tersimpan di sini). Pengganti pola lama
    // "browser bersih + suntik storageState" yang mudah terdeteksi.
    profileDirectory: path.join(PROJECT_ROOT, "storage", "profiles"),

    // Folder sesi LAMA (storageState.json). Tidak ditulis lagi -- hanya
    // dipakai sekali untuk seeding login ke profil permanen yang baru.
    sessionDirectory: path.join(PROJECT_ROOT, "storage", "sessions"),
  },

  // ---- Mode "chrome-portable": Chrome Portable asli di Windows ----
  chromePortable: {
    // Path ke chrome.exe di dalam folder Chrome Portable.
    // Isi sesuai lokasi instalasi Chrome Portable di komputer Windows.
    executablePath:
      process.env.CHROME_PORTABLE_PATH ||
      "C:\\ChromePortable\\App\\Chrome-bin\\chrome.exe",

    // Folder utama data Chrome Portable (isinya SEMUA profil/akun).
    // Ini folder "rumah kos"-nya; profileName di bawah ini "nomor kamar"-nya.
    userDataDir:
      process.env.CHROME_PORTABLE_USER_DATA_DIR ||
      "C:\\ChromePortable\\Data\\profile",
  },
};

export function getSessionConfig() {
  if (ENGINE_MODE === "chrome-portable") {
    return engineConfig.chromePortable;
  }

  const dataRoot =
    process.env.BOTWATCHER_DATA_DIR || PROJECT_ROOT;

  return {
    ...engineConfig.dev,
    sessionDirectory: path.join(dataRoot, "storage", "sessions"),
    profileDirectory: path.join(dataRoot, "storage", "profiles"),
  };
}

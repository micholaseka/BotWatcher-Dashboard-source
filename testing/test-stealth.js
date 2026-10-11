// testing/test-stealth.js
//
// Script UJI COBA penyamaran anti-bot. Jalankan:
//   node testing/test-stealth.js
//
// Langsung menguji stealth.js: buka halaman deteksi publik, lalu cek
// penanda automation yang biasa dipakai Facebook dkk:
//   1. navigator.webdriver harus false
//   2. User-Agent tidak boleh memuat "HeadlessChrome"
// Bukan bagian aplikasi -- cuma validasi manual selagi development.

import {
  getStealthChromium,
  stealthLaunchOptions,
} from "../src/marketplace/stealth.js";

const CHECK_URL = "https://bot.sannysoft.com";

async function main() {
  console.log("=== Test penyamaran (patchright) ===");

  const chromium = await getStealthChromium();
  const browser = await chromium.launch(stealthLaunchOptions);
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  console.log(`Membuka ${CHECK_URL} ...`);
  await page.goto(CHECK_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  const webdriver = await page.evaluate(() => navigator.webdriver);
  const userAgent = await page.evaluate(() => navigator.userAgent);

  console.log(`navigator.webdriver = ${webdriver}`);
  console.log(`User-Agent = ${userAgent}`);

  const problems = [];
  if (webdriver) problems.push("navigator.webdriver terdeteksi true.");
  if (userAgent.includes("HeadlessChrome")) {
    problems.push('User-Agent memuat "HeadlessChrome".');
  }

  if (problems.length > 0) {
    console.error("\nGAGAL:");
    for (const problem of problems) console.error(` - ${problem}`);
    await browser.close();
    process.exit(1);
  }

  console.log("\nOK: tidak ada penanda automation dasar. Jendela ditutup");
  console.log("otomatis dalam 10 detik (cukup buat lihat halaman tes).");

  // Beri waktu buat lihat halaman tes, lalu tutup rapi.
  await page.waitForTimeout(10000);
  await browser.close();
}

main().catch(async (err) => {
  console.error("Test gagal:", err.message);
  process.exit(1);
});

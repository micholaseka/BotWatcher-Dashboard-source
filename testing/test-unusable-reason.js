// testing/test-unusable-reason.js
//
// Tes kecil fungsi murni describeUnusable() dari checkUnread.js:
// memastikan URL salah (login/checkpoint/dashboard kosong) diterjemahkan
// jadi alasan status Tidur yang benar. Tidak buka browser.

import { describeUnusable } from "../src/monitor/checkUnread.js";

const cases = [
  {
    url: "https://www.facebook.com/login/?next=%2Fmarketplace%2Fyou%2Fdashboard%2F",
    contains: "Sesi login tidak valid",
  },
  {
    url: "https://www.facebook.com/checkpoint/1501092823525282/?next=https%3A%2F%2Fwww.facebook.com%2F",
    contains: "checkpoint",
  },
  {
    url: "https://www.facebook.com/marketplace/you/dashboard/?locale=id_ID",
    contains: "ditangguhkan",
  },
];

for (const { url, contains } of cases) {
  const reason = describeUnusable(url);

  if (!reason.includes(contains)) {
    console.error(`GAGAL: url=${url}`);
    console.error(`  harapan : alasan memuat "${contains}"`);
    console.error(`  dapat   : "${reason}"`);
    process.exit(1);
  }

  console.log(`OK: ${contains} -> "${reason}"`);
}

console.log("=== describeUnusable selesai ===");

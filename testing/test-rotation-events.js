// testing/test-rotation-events.js
//
// Tes kontrak event AccountRotator. UI (electron/main.mjs) bergantung pada
// event round_started/batch_started/batch_finished buat menampilkan progres
// ("Putaran #N", "Sedang cek: ...", highlight "Mengecek..."). Dulu event
// ini tidak pernah dipancarkan sama sekali -- progres di UI selalu kosong
// sehingga user mengira cuma akun pertama yang dicek.
//
// Tes ini jalan TANPA browser: _checkOneAccount di-stub.

import { AccountRotator } from "../src/rotation/accountRotator.js";

const rotator = new AccountRotator(["akun-a", "akun-b", "akun-c"], {
  minBatchSize: 2,
  maxBatchSize: 3,
  delayBetweenBatchesMs: 0,
  roundIntervalMs: 50,
});

const events = [];
rotator.on("round_started", (payload) =>
  events.push(["round_started", payload]),
);
rotator.on("batch_started", (payload) =>
  events.push(["batch_started", payload]),
);
rotator.on("batch_finished", (payload) =>
  events.push(["batch_finished", payload]),
);

// Stub: akun langsung "selesai dicek", tanpa buka browser.
rotator._checkOneAccount = async (accountId) => {
  rotator.emit("account_checked", {
    accountId,
    loggedIn: true,
    unreadCount: 0,
  });
};

const firstBatchDone = new Promise((resolve) => {
  rotator.once("batch_finished", () => resolve());
});

const finished = rotator.start(); // jangan di-await dulu
await firstBatchDone;
rotator.stop();
await finished;

const names = events.map(([name]) => name);

if (names[0] !== "round_started") {
  throw new Error(`Event pertama harus round_started, dapat: ${names[0]}.`);
}

if (!names.includes("batch_started")) {
  throw new Error("batch_started tidak pernah dipancarkan.");
}

if (!names.includes("batch_finished")) {
  throw new Error("batch_finished tidak pernah dipancarkan.");
}

const round = events.find(([name]) => name === "round_started")[1];

if (round.totalAccounts !== 3 || round.round !== 1) {
  throw new Error(
    `Payload round_started salah: ${JSON.stringify(round)} (harusnya round 1, total 3).`,
  );
}

const started = events.find(([name]) => name === "batch_started")[1];

if (!Array.isArray(started.batch) || started.batch.length === 0) {
  throw new Error("Payload batch_started tidak berisi daftar akun.");
}

if (typeof started.checkedSoFar !== "number") {
  throw new Error("Payload batch_started tidak berisi checkedSoFar.");
}

const order = names.slice(0, 3).join(" → ");
console.log(`Urutan event: ${order}`);
console.log(`Batch pertama: ${started.batch.join(", ")}`);
console.log("=== rotation events OK ===");

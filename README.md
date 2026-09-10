# botwatcher-dashboard

Dashboard semi-otomatis untuk memantau & membalas pesan Facebook Marketplace.

## Struktur folder

```
botwatcher-dashboard/
├── src/
│   ├── config/
│   │   └── engine.config.js   # atur mode "dev" (Chromium) vs "chrome-portable" (Windows, produksi)
│   ├── marketplace/
│   │   └── session.js         # buka browser & pastikan login (2 mode di atas)
│   ├── inbox/                 # fitur: Kotak Masuk
│   ├── notifications/         # fitur: Notifikasi Pesan Baru
│   ├── autoreply/              # fitur: Balasan Otomatis
│   └── monitor/                # fitur: Pemantauan Inbox
├── testing/
│   └── test-session.js        # script UJI COBA saja, terpisah dari src/
├── storage/
│   └── sessions/               # file sesi login per akun (mode dev), diabaikan git
├── index.js
└── package.json
```

Script di `testing/` **bukan** bagian dari aplikasi — cuma buat validasi manual
selagi development. Kalau nanti ada test otomatis (unit test dsb), taruh di
sini juga, terpisah dari `src/`.

## Menjalankan

```bash
npm install
npm run test:session          # test login dev-mode (Chromium), akun "test-account-1"
npm run test:session akun-2   # test dengan nama akun lain (file sesi beda)
```

Sesi tersimpan di `storage/sessions/<accountId>.json`. Jalankan
`npm run test:session` dua kali dengan `accountId` yang sama — kali kedua
harusnya langsung login otomatis tanpa perlu buka Facebook manual lagi.

## Mode engine

Diatur di `src/config/engine.config.js`, lewat env var `ENGINE_MODE`:

- `dev` (default) — Chromium bawaan Playwright, sesi via file `storageState.json`.
  Dipakai sekarang di Ubuntu untuk development & testing.
- `chrome-portable` — Chrome Portable asli di Windows, langsung pakai profil
  (`Profile 1`, `Profile 2`, dst) yang sudah berisi sesi login. Ini mode
  produksi nanti — belum diuji, isi `CHROME_PORTABLE_PATH` dan
  `CHROME_PORTABLE_USER_DATA_DIR` sesuai lokasi instalasi di komputer target.

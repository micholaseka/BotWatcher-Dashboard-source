# Bot Engine

Orkestrator pengecekan adalah `src/rotation/accountRotator.js`.

Alur runtime:

`AccountManager -> AccountRotator (batch 5-10 akun paralel) -> MarketplaceSession -> checkUnreadCount -> TelegramNotifier`

- Semua pengecekan berjalan **headless** (tanpa window browser).
- Sesi "Balas Sekarang" / "Login Ulang" tetap **headful** supaya user
  bisa melihat dan berinteraksi.
- Progres putaran dikirim ke UI lewat event `round_started`,
  `batch_started`, dan `batch_finished`.
- Pengecekan headless hanya membuka dashboard satu kali. Halaman suspend,
  disable, blokir, login, atau checkpoint langsung dianggap tidak tersedia;
  navigasi dashboard dibatasi 15 detik agar satu akun bermasalah tidak
  menahan rotasi akun berikutnya.
- Saat jumlah pesan belum dibalas bertambah, aplikasi mengirim POST JSON ke
  Hermes (`http://localhost:8644/webhooks/BotWatcher-Dashboard`). URL dapat
  diganti lewat `HERMES_WEBHOOK_URL`. Payload memuat `signal: "wake"`,
  `accountId`, `accountName`, `hasNewMessages`, `newMessageCount` (selisih
  sejak pemeriksaan sebelumnya), dan `unreadCount` (total saat ini).

UI React berkomunikasi dengan engine melalui Electron IPC; React tidak
menjalankan Playwright/patchright langsung.

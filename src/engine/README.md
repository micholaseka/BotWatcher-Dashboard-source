# Bot Engine

Orkestrator pengecekan adalah `src/rotation/accountRotator.js`.

Alur runtime:

`AccountManager -> AccountRotator (batch 5-10 akun paralel) -> MarketplaceSession -> checkUnreadCount -> TelegramNotifier`

- Semua pengecekan berjalan **headless** (tanpa window browser).
- Sesi "Balas Sekarang" / "Login Ulang" tetap **headful** supaya user
  bisa melihat dan berinteraksi.
- Progres putaran dikirim ke UI lewat event `round_started`,
  `batch_started`, dan `batch_finished`.

UI React berkomunikasi dengan engine melalui Electron IPC; React tidak
menjalankan Playwright/patchright langsung.

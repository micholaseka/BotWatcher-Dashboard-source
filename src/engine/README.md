# Bot Engine

`botEngine.js` adalah orkestrator utama aplikasi.

Alur runtime:

`AccountManager -> MarketplaceSession -> InboxMonitor -> TelegramNotifier`

UI React berkomunikasi dengan engine melalui Electron IPC; React tidak menjalankan Playwright langsung.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Vite config — versi disederhanakan (plugin khusus platform "Figma Make"
// dibuang karena butuh file ./.figma/make/site.json yang gak ikut kebawa
// pas di-export, dan memang gak relevan buat project ini).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

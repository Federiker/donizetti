import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The demo app: in the browser (`mise run dev`) and as the Tauri window's interface (`mise run tauri:dev`).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1430, strictPort: true },
  build: { target: "es2022" },
});

import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    // Remove WS proxying; connect directly to workers.dev in browser via wss/https
  },
  resolve: {
    dedupe: ["react", "react-dom"]
  }
});

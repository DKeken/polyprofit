import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@core-bindings": path.resolve(__dirname, "../crates/pp-core/bindings"),
      "@server-bindings": path.resolve(
        __dirname,
        "../crates/pp-server/bindings",
      ),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
});

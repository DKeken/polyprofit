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
      "/api": {
        target: "http://localhost:3000",
        configure: (proxy) => {
          proxy.on("error", () => {});
        },
      },
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
        configure: (proxy) => {
          proxy.on("error", () => {});
        },
      },
    },
  },
});

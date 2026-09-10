import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* النشر أحادي السيرفر (VPS): Express يخدم مجلد dist/ نفسه،
   لذلك في التطوير نوكّل /api و /socket.io إلى خادم Node المحلي. */
export default defineConfig({
  root: path.resolve(__dirname, "."),
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8080",
        changeOrigin: true,
      },
      "/socket.io": {
        target: process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8080",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
  build: {
    outDir: path.resolve(__dirname, "..", "dist"),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          socket: ["socket.io-client"],
        },
      },
    },
  },
});

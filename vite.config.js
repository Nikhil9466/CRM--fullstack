import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: "front end",
  plugins: [
    react(),
    {
      name: "crm-home",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/") {
            res.writeHead(302, { Location: "/home.html" });
            res.end();
          } else next();
        });
      },
    },
  ],
  publicDir: "public",
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.CRM_DEV_API_PORT || "4000"}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        [
          "home",
          "login",
          "signup",
          "forgot-password",
          "reset-password",
          "account",
        ].map((name) => [name, resolve("front end", name + ".html")]),
      ),
    },
  },
});

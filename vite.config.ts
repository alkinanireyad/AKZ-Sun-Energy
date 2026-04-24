import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/AKZ-Sun-Energy/", 
plugins: [react(), tailwindcss()],
resolve: {
  alias: {
    "@": path.resolve(__dirname, "src"),
  },

    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
  },
});

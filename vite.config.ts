import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  // Library build mode
  if (mode === "lib") {
    return {
      plugins: [react(), tailwindcss()],
      assetsInclude: ["**/*.wasm"],
      build: {
        lib: {
          entry: resolve(__dirname, "src/index.ts"),
          name: "Aerial",
          formats: ["es", "umd"],
          fileName: (format) => (format === "es" ? "aerial.js" : "aerial.umd.cjs"),
        },
        rollupOptions: {
          external: [
            "react",
            "react-dom",
            "react/jsx-runtime",
            "motion",
            "motion/react",
            "lucide-react",
          ],
          output: {
            assetFileNames: (assetInfo) => {
              if (assetInfo.names?.some(n => n.endsWith(".css")) || assetInfo.name?.endsWith(".css")) {
                return "aerial.css";
              }
              return "[name].[ext]";
            },
            globals: {
              react: "React",
              "react-dom": "ReactDOM",
              "react/jsx-runtime": "jsxRuntime",
              "motion/react": "motion",
              "lucide-react": "lucideReact",
            },
          },
        },
      },
    };
  }

  // Standalone desktop (Tauri) build mode
  return {
    plugins: [react(), tailwindcss()],

    // Serve .wasm files with correct MIME type
    assetsInclude: ["**/*.wasm"],

    // Prevent Vite from obscuring rust errors
    clearScreen: false,

    // Tauri expects a fixed port
    server: {
      port: 1420,
      strictPort: true,
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
      watch: {
        ignored: ["**/src-tauri/**", "**/aerial-engine/target/**"],
      },
    },
  };
});

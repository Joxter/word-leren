import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wyw from "@wyw-in-js/vite";

export default defineConfig({
  base: "/word-leren/",
  plugins: [
    wyw({
      displayName: true,
      prefixer: false,

      include: ["**/*.{ts,tsx}"],
      babelOptions: {
        presets: [
          "@babel/preset-typescript",
          ["@babel/preset-react", { runtime: "automatic" }],
        ],
      },
    }),
    react(),
  ],
});

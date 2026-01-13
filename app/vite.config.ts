import * as url from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig((env) => ({
  base: "",
  build: {
    rolldownOptions: {
      treeshake: {
        moduleSideEffects: [{ test: /cryptlight/, sideEffects: false }],
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [
          ["babel-plugin-react-compiler"],
          ["@babel/plugin-proposal-decorators", { version: "2023-11" }],
        ],
      },
    }),
  ],
  ...(env.command === "build"
    ? {}
    : {
        resolve: {
          alias: {
            cryptlight: url.fileURLToPath(
              new URL("../src/index.ts", import.meta.url),
            ),
          },
        },
      }),
}));

import * as url from "node:url";
import { defaultClientConditions, defineConfig } from "vite";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";

const cryptlightDist = url.fileURLToPath(new URL("../dist/", import.meta.url));

export default defineConfig((env) => ({
  base: "",
  build: {
    rolldownOptions: {
      treeshake: {
        moduleSideEffects: (id) =>
          id.startsWith(cryptlightDist) ? false : undefined,
      },
    },
  },
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
      plugins: [["@babel/plugin-proposal-decorators", { version: "2023-11" }]],
    }),
  ],
  ...(env.command === "build"
    ? {}
    : {
        resolve: {
          conditions: ["cryptlight-source", ...defaultClientConditions],
          alias: {
            cryptlight: url.fileURLToPath(
              new URL("../src/index.ts", import.meta.url),
            ),
          },
        },
      }),
}));

import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: "react-jsx",
  },
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globalSetup: "./vitest/vitest.global-setup.mts",
    exclude: ["./tests", "**/node_modules", "**/dist"],
  },
});

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/language-tool/",
  test: {
    environment: "node",
    // Every suite in the repo, including scripts/*.test.mjs.
    // CI fails if a *.test.* or *.spec.* file on disk is outside this pattern.
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
  },
});

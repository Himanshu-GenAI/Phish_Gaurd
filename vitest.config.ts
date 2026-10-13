import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "lib/rules/**",
        "lib/scoring/**",
        "lib/validation.ts",
        "lib/analyze/**",
        "lib/checks/**",
        "lib/ai/**",
        "app/api/analyze/**",
      ],
    },
  },
});

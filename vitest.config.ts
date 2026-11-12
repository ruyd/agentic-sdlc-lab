import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // test/adversarial/ is the adversary agent's scratch space during review; it is never part of the suite.
    exclude: ["test/adversarial/**", "node_modules/**"],
  },
});

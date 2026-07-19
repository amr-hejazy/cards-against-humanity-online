import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5432/cah_test",
      JWT_SECRET: "test-secret",
      JWT_EXPIRES_IN: "1d",
      PORT: "3000",
      LOGS_PATH: "logs",
    },
    exclude: ["dist/**", "node_modules/**"],
    pool: "forks",
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});

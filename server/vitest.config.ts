import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests hit a real Postgres (oda_test) — isolate from dev data and run
    // serially so truncates can't race across files.
    env: {
      DATABASE_URL:
        "postgresql://oda:oda-dev-only-change-me@localhost:5432/oda_test",
    },
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});

import { defineConfig, devices } from "@playwright/test";

/**
 * These tests drive a real Foundry instance — they do not mock it.
 *
 * That is a deliberate trade. Phonedry's whole job is to interfere with
 * Foundry's startup sequence at exactly the right moment, and every bug found
 * so far has come from core behaving differently than expected rather than from
 * our own logic being wrong internally. A mocked Foundry would have reproduced
 * our assumptions faithfully and caught none of them.
 *
 * The cost is that these cannot run in CI: Foundry requires a licence and a
 * world, neither of which belongs in a public repository. This suite is a local
 * pre-flight check, run against the Docker instance before a milestone is
 * called done. The unit tests planned for the data mappers are the part that
 * will run in CI, because those are pure functions with no Foundry attached.
 */
export default defineConfig({
  testDir: "./test/e2e",

  // Foundry's startup is not fast, especially the first load of a world.
  timeout: 120_000,
  expect: { timeout: 15_000 },

  // A failing smoke test means the boot path is broken; retrying just delays
  // the diagnosis and can mask a genuine intermittency worth knowing about.
  retries: 0,
  fullyParallel: false,
  workers: 1,

  reporter: [["list"]],

  use: {
    baseURL: process.env.PHONEDRY_FOUNDRY_URL ?? "http://localhost:30000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});

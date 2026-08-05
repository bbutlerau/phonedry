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
    },

    /*
     * WebKit earns its place in this suite by having caught things Chromium
     * cannot. Every browser on iOS is WebKit — Chrome and Firefox on an iPhone
     * are Safari underneath — so half the target devices run an engine that
     * Chromium testing says nothing about.
     *
     * The two bugs that prompted this were both invisible in Chromium: the
     * long-press gesture that iOS turned into a text selection, and Foundry's
     * roll dialog rendering with its entire middle collapsed. Both reached a
     * real device before anything caught them.
     *
     * This is not Safari, and it is not iOS: no touch callout, no memory
     * ceiling, no Safari-specific chrome. It shares the engine, which is where
     * layout bugs of this kind live, and that is what it is here for. The iPad
     * is still the final word.
     */
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] }
    }
  ]
});

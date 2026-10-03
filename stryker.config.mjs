// Mutation testing only where a surviving mutant is a real business bug
// (TESTING_STANDARDS §6). The scope grows with the decision modules:
// lockout (T5), credit policy (T10), eligibility and confidence (T11).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: { configFile: "vitest.config.mts" },
  mutate: [
    // BR-AUTH-02
    "src/server/modules/auth/lockout.ts",
  ],
  // perTest runs only the tests that reach each mutant. It needs the patch
  // in patches/ (TD19): Stryker names tests "suite test", Vitest 5 matches
  // "suite > test", and without it no test ran and every mutant survived.
  coverageAnalysis: "perTest",
  thresholds: { high: 90, low: 80, break: 80 },
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  tempDirName: ".stryker-tmp",
};

export default config;

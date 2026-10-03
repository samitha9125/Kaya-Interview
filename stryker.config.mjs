// Mutation testing only where a surviving mutant is a real business bug
// (TESTING_STANDARDS §6). The scope grows with the decision modules:
// lockout (T5), credit policy (T10), eligibility and confidence (T11).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: { configFile: "vitest.config.mts" },
  mutate: [],
  // Only while the scope is empty: with nothing to mutate, Vitest finds no
  // related tests and Stryker would fail. Remove when T5 adds lockout.
  allowEmpty: true,
  coverageAnalysis: "perTest",
  thresholds: { high: 90, low: 80, break: 80 },
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  tempDirName: ".stryker-tmp",
};

export default config;

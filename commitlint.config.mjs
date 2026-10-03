// Conventional Commits: https://www.conventionalcommits.org
// Squash-merged PR titles are checked with the same rules in CI.
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 100],
  },
};

export default config;

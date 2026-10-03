// Conventional Commits: https://www.conventionalcommits.org
// Checked on every commit by the commit-msg hook. There are no PRs: task
// branches merge into develop with --no-ff, so each commit lands as written.
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 100],
  },
};

export default config;

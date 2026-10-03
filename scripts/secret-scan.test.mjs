import { describe, expect, it } from "vitest";
import { IGNORE_MARKER, findSecrets, isForbiddenFile, scanFiles } from "./secret-scan.mjs";

// Fakes are assembled at runtime so this file never contains a real-looking secret.
const fake = {
  openrouter: "sk-or-v1-" + "a".repeat(64),
  anthropic: "sk-ant-" + "b".repeat(40),
  github: "ghp_" + "C".repeat(36),
  aws: "AKIA" + "D".repeat(16),
  privateKey: "-----BEGIN RSA " + "PRIVATE KEY-----",
  credential: "api_key = " + '"' + "x".repeat(20) + '"',
};

describe("findSecrets", () => {
  it.each([
    ["openrouter-key", fake.openrouter],
    ["anthropic-key", fake.anthropic],
    ["github-token", fake.github],
    ["aws-access-key", fake.aws],
    ["private-key", fake.privateKey],
    ["hardcoded-credential", fake.credential],
  ])("detects %s", (rule, line) => {
    expect(findSecrets(`ok\n${line}\n`, "f.ts")).toEqual([{ file: "f.ts", line: 2, rule }]);
  });

  it("ignores ordinary code and short placeholder values", () => {
    const code = 'const token = getToken();\nconst password = "";\nOPENROUTER_API_KEY=';
    expect(findSecrets(code, "f.ts")).toEqual([]);
  });

  it("skips lines marked as known fakes", () => {
    expect(findSecrets(`${fake.openrouter} // ${IGNORE_MARKER}`, "seed.ts")).toEqual([]);
  });
});

describe("isForbiddenFile", () => {
  it.each([".env", ".env.local", "config/.env.production"])("forbids %s", (path) => {
    expect(isForbiddenFile(path)).toBe(true);
  });

  it.each([".env.example", "env.ts", "src/.envrc.md"])("allows %s", (path) => {
    expect(isForbiddenFile(path)).toBe(false);
  });
});

describe("scanFiles", () => {
  const files = {
    "src/a.ts": "const x = 1;",
    "src/b.ts": fake.github,
    "img.png": "\0binary",
  };
  const read = (path) => files[path] ?? null;

  it("reports env files, secrets, and skips binaries, lockfile and unreadable files", () => {
    const paths = [".env.local", "pnpm-lock.yaml", "missing.ts", ...Object.keys(files)];
    expect(scanFiles(paths, read)).toEqual([
      { file: ".env.local", line: 0, rule: "env-file" },
      { file: "src/b.ts", line: 1, rule: "github-token" },
    ]);
  });
});

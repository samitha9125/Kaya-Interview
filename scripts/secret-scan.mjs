#!/usr/bin/env node
// Lightweight secret scanner used by the pre-commit hook and CI.
//
// It is a last-line safety net, not a replacement for a dedicated service.
// For a real repository, also enable GitHub secret scanning with push
// protection, or a tool such as GitGuardian / gitleaks.
//
// Usage:
//   node scripts/secret-scan.mjs --staged   # files staged for commit
//   node scripts/secret-scan.mjs            # every tracked file
//
// A line containing `secret-scan:ignore` is skipped (use for demo fixtures).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const IGNORE_MARKER = "secret-scan:ignore";

export const RULES = [
  { id: "openrouter-key", pattern: /sk-or-v1-[a-f0-9]{32,}/ },
  { id: "anthropic-key", pattern: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { id: "openai-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/ },
  { id: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
  { id: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "slack-token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { id: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    id: "hardcoded-credential",
    pattern: /\b(?:api[_-]?key|secret|password|passwd|token)\b["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i,
  },
];

const SKIPPED_FILES = new Set(["pnpm-lock.yaml"]);
const MAX_BYTES = 1_000_000;

/** `.env`, `.env.local`, ... must never be committed; `.env.example` is fine. */
export function isForbiddenFile(path) {
  const name = path.split("/").pop() ?? "";
  return /^\.env(\..+)?$/.test(name) && name !== ".env.example";
}

/** Returns one finding per offending line (first matching rule wins). */
export function findSecrets(content, file) {
  const findings = [];
  content.split("\n").forEach((text, index) => {
    if (text.includes(IGNORE_MARKER)) return;
    const rule = RULES.find((r) => r.pattern.test(text));
    if (rule) findings.push({ file, line: index + 1, rule: rule.id });
  });
  return findings;
}

/** Scans a set of files; `read` returns file content or null to skip. */
export function scanFiles(paths, read) {
  const findings = [];
  for (const path of paths) {
    if (isForbiddenFile(path)) {
      findings.push({ file: path, line: 0, rule: "env-file" });
      continue;
    }
    if (SKIPPED_FILES.has(path)) continue;
    const content = read(path);
    if (content === null || content.length > MAX_BYTES || content.includes("\0")) continue;
    findings.push(...findSecrets(content, path));
  }
  return findings;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
}

function listFiles(staged) {
  const out = staged
    ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
    : git(["ls-files"]);
  return out.split("\n").filter(Boolean);
}

function readFile(path, staged) {
  try {
    return staged ? git(["show", `:${path}`]) : readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function main() {
  const staged = process.argv.includes("--staged");
  const findings = scanFiles(listFiles(staged), (path) => readFile(path, staged));
  if (findings.length === 0) return;

  console.error("Possible secrets found. Commit blocked:\n");
  for (const f of findings) {
    const where = f.line > 0 ? `${f.file}:${f.line}` : f.file;
    console.error(`  ${where}  [${f.rule}]`);
  }
  console.error(`\nRemove the secret, or add "${IGNORE_MARKER}" to a line that is a known fake.`);
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
